import { store, toLocalInput } from './store.svelte'
import { ALL_SCOPES, forgetToken, getToken, hasValidToken, revokeToken } from './google'
import { cloud } from './cloud.svelte'
import type { Reminder, Task } from './types'

const API = 'https://www.googleapis.com/calendar/v3'
const CAL_NAME = 'To-Do Reminders'

const RRULE: Record<string, string> = {
  daily: 'RRULE:FREQ=DAILY',
  weekly: 'RRULE:FREQ=WEEKLY',
  monthly: 'RRULE:FREQ=MONTHLY',
  yearly: 'RRULE:FREQ=YEARLY',
}

const eventId = (r: Reminder) => 'r' + r.id.replace(/-/g, '') // base32hex-compatible

class GCal {
  status = $state<'off' | 'ok' | 'syncing' | 'reconnect' | 'error'>('off')
  message = $state('')
  lastSync = $state<number | null>(null)

  get clientId() { return store.pref('gClientId', '') }
  get connected() { return store.pref('gConnected', false) }
  get showTitles() { return store.pref('gShowTitles', false) }

  init() {
    this.status = this.connected ? (hasValidToken() ? 'ok' : 'reconnect') : 'off'
  }

  async connect() {
    if (!this.clientId.trim()) { this.fail('Enter your Google OAuth Client ID first'); return }
    try {
      this.status = 'syncing'
      await getToken(this.clientId.trim(), ALL_SCOPES, true)
      store.setPref('gConnected', true)
      await this.sync()
    } catch (e) {
      this.fail((e as Error).message)
    }
  }

  disconnect() {
    revokeToken()
    store.setPref('gConnected', false)
    this.status = 'off'
    this.message = 'Disconnected. Existing calendar events are left in place.'
  }

  private fail(msg: string) {
    this.status = this.connected ? 'reconnect' : 'error'
    this.message = msg
  }

  private async api<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401) forgetToken()
    const data = (res.status === 204 ? null : await res.json().catch(() => null)) as T
    return { status: res.status, data }
  }

  private async ensureCalendar(token: string): Promise<string> {
    const saved = store.pref('gCalId', '')
    if (saved) {
      const r = await this.api(token, '/calendars/' + encodeURIComponent(saved))
      // Only a definite "gone" means we should look for / create another one; any other answer (403, 5xx, network
      // hiccup) keeps the saved calendar, otherwise every reconnect would spawn a duplicate.
      if (r.status !== 404 && r.status !== 410) return saved
    }
    // Reuse a calendar created earlier (another device, or after the local data was cleared) instead of making a duplicate.
    const list = await this.api<{ items?: { id: string; summary?: string }[] }>(token, '/users/me/calendarList?minAccessRole=owner')
    const existing = list.status === 200 ? (list.data?.items ?? []).filter((c) => c.summary === CAL_NAME).map((c) => c.id).sort()[0] : undefined
    if (existing) {
      store.setPref('gCalId', existing)
      store.setPref('gCalIdT', Date.now())
      store.setPref('gEvents', {})
      return existing
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const r = await this.api<{ id: string }>(token, '/calendars', 'POST', {
      summary: CAL_NAME,
      description: 'Reminders created by the to-do app',
      timeZone: tz,
    })
    if (r.status !== 200) throw new Error('Cannot create calendar (' + r.status + ')')
    store.setPref('gCalId', r.data.id)
    store.setPref('gCalIdT', Date.now())
    store.setPref('gEvents', {})
    return r.data.id
  }

  private buildEvent(t: Task, r: Reminder, tz: string) {
    const end = toLocalInput(new Date(new Date(r.at).getTime() + 15 * 60000))
    return {
      id: eventId(r),
      // Calendar text is readable by Google: keep it generic unless the user opted in.
      summary: this.showTitles ? '🔔 ' + t.title : '🔔 To-do reminder',
      description: this.showTitles ? '' : 'Open the to-do app to see the details.',
      start: { dateTime: r.at + ':00', timeZone: tz },
      end: { dateTime: end + ':00', timeZone: tz },
      recurrence: r.repeat !== 'none' ? [RRULE[r.repeat]] : undefined,
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    }
  }

  /** Push the current reminders to Google Calendar (create / update / delete). */
  async sync() {
    if (!this.connected) return
    const clientId = this.clientId.trim()
    let token: string
    try {
      token = await getToken(clientId, ALL_SCOPES, false)
    } catch {
      this.fail('Sign-in needed: open Settings and press Connect')
      return
    }
    try {
      this.status = 'syncing'
      await cloud.ready() // adopt the calendar id shared by other devices first
      const calId = await this.ensureCalendar(token)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const stored = { ...(store.pref('gEvents', {}) as Record<string, string>) }
      const desired = new Map<string, { sig: string; ev: ReturnType<GCal['buildEvent']> }>()
      for (const t of store.tasks) {
        if (t.done) continue
        for (const r of t.reminders) {
          if (r.fired) continue
          const ev = this.buildEvent(t, r, tz)
          desired.set(ev.id, { sig: JSON.stringify(ev), ev })
        }
      }
      const base = '/calendars/' + encodeURIComponent(calId) + '/events'
      for (const [id, d] of desired) {
        if (stored[id] === d.sig) continue
        let r = await this.api(token, base, 'POST', d.ev)
        if (r.status === 409) r = await this.api(token, base + '/' + id, 'PUT', d.ev)
        if (r.status >= 300) throw new Error('Calendar error ' + r.status)
        stored[id] = d.sig
      }
      for (const id of Object.keys(stored)) {
        if (desired.has(id)) continue
        const r = await this.api(token, base + '/' + id, 'DELETE')
        if (r.status >= 300 && r.status !== 404 && r.status !== 410) throw new Error('Calendar error ' + r.status)
        delete stored[id]
      }
      store.setPref('gEvents', stored)
      this.lastSync = Date.now()
      this.status = 'ok'
      this.message = ''
    } catch (e) {
      this.status = 'error'
      this.message = (e as Error).message
    }
  }
}

export const gcal = new GCal()
