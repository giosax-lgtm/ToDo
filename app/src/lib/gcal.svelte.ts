// REMINDER SU GOOGLE CALENDAR. Ogni reminder non ancora scattato dei task non completati diventa un evento nel calendario dedicato 'To-Do Reminders',
// cosi' il telefono notifica anche con l'app chiusa. Esporta il singleton 'gcal' (stato reattivo + azioni).
// Dipende da: lib/store.svelte.ts (task, preferenze 'gCalId', 'gEvents'...), lib/google.ts (token), lib/cloud.svelte.ts (id calendario condiviso tra dispositivi).
// Chiamato da: App.svelte (sync dopo ogni modifica dei reminder), Settings.svelte (connetti/disconnetti/ricrea calendario), Sidebar.svelte e Reminders.svelte (stato).
// Per non duplicare eventi tiene in 'gEvents' la firma dell'ultimo evento inviato per ogni reminder; invia solo le differenze (crea/aggiorna/elimina).

import { store, toLocalInput } from './store.svelte'
import { ALL_SCOPES, forgetToken, getToken, hasValidToken, revokeToken } from './google'
import { cloud } from './cloud.svelte'
import type { Reminder, Task } from './types'

// Endpoint dell'API Calendar v3 e nome del calendario creato dall'app.
const API = 'https://www.googleapis.com/calendar/v3'
const CAL_NAME = 'To-Do Reminders'

// Traduzione della ripetizione (tipo Repeat) nella regola di ricorrenza di Google Calendar.
const RRULE: Record<string, string> = {
  daily: 'RRULE:FREQ=DAILY',
  weekly: 'RRULE:FREQ=WEEKLY',
  monthly: 'RRULE:FREQ=MONTHLY',
  yearly: 'RRULE:FREQ=YEARLY',
}

// Id dell'evento ricavato dall'id del reminder (solo caratteri ammessi da Google): stesso reminder = stesso evento, quindi gli aggiornamenti sono idempotenti.
const eventId = (r: Reminder) => 'r' + r.id.replace(/-/g, '') // base32hex-compatible

// Servizio Calendar. Lo stato reattivo e' letto da Settings.svelte, Sidebar.svelte e Reminders.svelte.
class GCal {
  // Stato osservabile: stato corrente, messaggio d'errore e ultimo sync riuscito.
  status = $state<'off' | 'ok' | 'syncing' | 'reconnect' | 'error'>('off')
  message = $state('')
  lastSync = $state<number | null>(null)

  // Preferenze lette dallo store: Client ID OAuth, 'connesso' si/no, e se mostrare i titoli dei task nel calendario (default no, per privacy).
  get clientId() { return store.pref('gClientId', '') }
  get connected() { return store.pref('gConnected', false) }
  get showTitles() { return store.pref('gShowTitles', false) }

  // Chiamata da App.svelte all'avvio: imposta lo stato iniziale ('ok' se il token e' valido, 'reconnect' se serve il login, 'off' se non connesso).
  init() {
    this.status = this.connected ? (hasValidToken() ? 'ok' : 'reconnect') : 'off'
  }

  // Collega Google Calendar: ottiene il token con popup (da click), segna 'connesso' e sincronizza. Chiamata dai pulsanti Connect/Reconnect di Settings.svelte.
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

  // Dimentica il calendario salvato e ne fa riottenere uno (riusa 'To-Do Reminders' se esiste, altrimenti lo crea). Pulsante 'Recreate calendar' di Settings.svelte.
  /** Forget the saved calendar and make sure one exists again (reuses an existing "To-Do Reminders", else creates it). */
  async resetCalendar() {
    await this.running
    store.setPref('gCalId', undefined)
    store.setPref('gCalIdT', 0)
    store.setPref('gEvents', {})
    await this.sync()
  }

  // Scollega Calendar: revoca il token e disattiva la funzione (gli eventi gia' creati restano nel calendario). Pulsante Disconnect di Settings.svelte.
  disconnect() {
    revokeToken()
    store.setPref('gConnected', false)
    this.status = 'off'
    this.message = 'Disconnected. Existing calendar events are left in place.'
  }

  // Registra un errore di login/connessione: stato 'reconnect' se era connesso, altrimenti 'error'.
  private fail(msg: string) {
    this.status = this.connected ? 'reconnect' : 'error'
    this.message = msg
  }

  // Wrapper delle chiamate REST a Calendar con il token; su 401 dimentica il token. Restituisce stato HTTP e JSON. Usato da ensureCalendar e doSync.
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

  // Restituisce l'id del calendario da usare: verifica quello salvato (solo 404/410 significa 'cancellato'), altrimenti prima adotta quello condiviso dagli altri dispositivi (cloud.sync/ready),
  // poi cerca un 'To-Do Reminders' esistente e solo come ultima scelta ne crea uno nuovo. Evita calendari duplicati.
  private async ensureCalendar(token: string): Promise<string> {
    // Probe the saved calendar through its events (a plain GET on the calendar can fail under the narrow
    // calendar.app.created scope even though it exists). Only a definite 404/410 means it was deleted; any other
    // answer keeps the saved id so a hiccup never spawns a duplicate.
    const saved = store.pref('gCalId', '')
    if (saved) {
      const r = await this.api(token, '/calendars/' + encodeURIComponent(saved) + '/events?maxResults=1')
      if (r.status !== 404 && r.status !== 410) return saved
      store.setPref('gCalId', undefined)
      store.setPref('gCalIdT', 0) // so any calendar id shared by another device wins
      store.setPref('gEvents', {})
      // Another device may already have made a replacement: pull the shared id before creating a second one.
      await cloud.sync()
      await cloud.ready()
      const adopted = store.pref('gCalId', '')
      if (adopted && adopted !== saved) return adopted
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

  // Costruisce l'evento Google per un reminder (orario, durata 15 min, ricorrenza, popup a 0 minuti). Titolo generico a meno che l'utente abbia attivato 'Show task titles'.
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

  // Controllo di concorrenza: promessa della sync in corso e flag di rilancio (due sync parallele creavano due calendari).
  private running: Promise<void> | null = null
  private again = false

  // Spinge i reminder su Calendar, mai due esecuzioni insieme: se una e' in corso ne accoda una seconda. Chiamata da App.svelte (4 s dopo le modifiche e all'avvio) e da Settings.svelte.
  /**
   * Push the current reminders to Google Calendar (create / update / delete).
   * Never runs twice at once: two parallel runs both saw "no calendar yet" and each created one.
   */
  async sync(): Promise<void> {
    if (this.running) { this.again = true; return this.running }
    this.running = this.doSync(true).finally(() => { this.running = null })
    await this.running
    if (this.again) { this.again = false; await this.sync() }
  }

  // Esegue la sincronizzazione: ottiene il token (senza popup), assicura il calendario, calcola gli eventi desiderati dai task, crea/aggiorna quelli cambiati (confrontando la firma salvata in 'gEvents')
  // ed elimina quelli non piu' necessari. Se il calendario risulta cancellato riparte una volta da zero (parametro retry).
  private async doSync(retry: boolean): Promise<void> {
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
        if (r.status === 404 && retry) { // the calendar was deleted in Google Calendar: forget it and start over
          store.setPref('gCalId', undefined)
          store.setPref('gEvents', {})
          return this.doSync(false)
        }
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

// Istanza unica del servizio, importata da App.svelte, Settings.svelte, Sidebar.svelte e Reminders.svelte.
export const gcal = new GCal()
