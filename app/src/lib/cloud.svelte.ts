import { db } from './db'
import { store } from './store.svelte'
import { ALL_SCOPES, forgetToken, getToken, hasValidToken, loadGis } from './google'
import { listFiles, download, upload, type DriveFile } from './drive'
import { createVault, decryptJson, encryptJson, openVault, type KeyFile } from './crypto'
import { detectLocal, hashAll, mergeRemote, purgeTombstones, type BaseEnt, type FileState } from './merge'

const KEYFILE = 'keyfile.json'

/** Automatic sync frequency options (minutes; 0 = instant, null = manual only). */
export const SYNC_FREQ: [string, string, number | null][] = [
  ['instant', 'Automatic: a few seconds after each change (and every minute)', 0],
  ['15m', 'Every 15 minutes', 15],
  ['1h', 'Every hour', 60],
  ['6h', 'Every 6 hours', 360],
  ['24h', 'Once a day', 1440],
  ['manual', 'Manual only (Sync now button)', null],
]

class Cloud {
  status = $state<'off' | 'locked' | 'syncing' | 'ok' | 'error'>('off')
  message = $state('')
  lastSync = $state<number | null>(null)
  /** True when Google sign-in must be renewed (token lives in memory only and lasts 1 hour). */
  authNeeded = $state(false)
  /** Shown once after creating a vault. */
  recoveryKey = $state<string | null>(null)

  private dek: CryptoKey | null = null
  private running = false
  private again = false
  private last: Promise<void> = Promise.resolve()

  get enabled() { return store.pref('cloudOn', false) }
  get freq() { return store.pref('syncFreq', 'instant') }

  /**
   * Called by timers/events. 'change' = local edit, 'tick' = periodic check, 'start' = app opened.
   * Interval modes sync when the last successful sync is older than the interval (checked on start and every minute while the app is open).
   */
  autoSync(trigger: 'change' | 'tick' | 'start') {
    if (!this.enabled || !this.dek) return
    const mins = (SYNC_FREQ.find((f) => f[0] === this.freq) ?? SYNC_FREQ[0])[2]
    if (mins === null) return // manual
    if (mins === 0) { void this.sync(); return }
    if (trigger === 'change') return
    const last = store.pref('cloudLast', 0)
    if (Date.now() - last >= mins * 60000) void this.sync()
  }
  private get clientId() { return store.pref('gClientId', '').trim() }

  private device(): string {
    let d = store.pref('syncDevice', '')
    if (!d) { d = crypto.randomUUID().slice(0, 8); store.setPref('syncDevice', d) }
    return d
  }

  async init() {
    if (!this.enabled) { this.status = 'off'; return }
    this.lastSync = store.pref('cloudLast', 0) || null
    this.dek = ((await db.settings.get('x:dek'))?.value as CryptoKey | undefined) ?? null
    this.status = this.dek ? 'ok' : 'locked'
  }

  /**
   * Make sure a Google token is available. Silent attempt first (works while the browser is signed in to Google);
   * if that fails, call again with interactive=true from a user click (a quick popup, usually closes by itself).
   */
  async ensureAuth(interactive: boolean): Promise<boolean> {
    if (!this.clientId) return false
    if (hasValidToken()) { this.authNeeded = false; return true }
    if (!interactive) { this.authNeeded = true; return false }
    try {
      await loadGis()
      await getToken(this.clientId, ALL_SCOPES, interactive)
      this.authNeeded = false
      return true
    } catch (e) {
      this.authNeeded = true
      if (interactive) { this.status = 'error'; this.message = (e as Error).message }
      return false
    }
  }

  /** Resolves when the running/last sync has finished (used so Calendar waits for the shared calendar id). */
  ready(): Promise<void> { return this.enabled ? this.last : Promise.resolve() }

  private fail(e: unknown) {
    this.status = 'error'
    this.message = (e as Error).message || String(e)
  }

  private async token(interactive: boolean) {
    if (!this.clientId) throw new Error('Enter your Google OAuth Client ID first')
    return getToken(this.clientId, ALL_SCOPES, interactive)
  }

  private async saveDek(key: CryptoKey) {
    this.dek = key
    await db.settings.put({ key: 'x:dek', value: key }) // non-extractable key stored locally
    store.setPref('cloudOn', true)
  }

  /** First device: create the encryption vault. Returns the recovery key (show it once!). */
  async create(passphrase: string): Promise<void> {
    try {
      this.status = 'syncing'
      const token = await this.token(true)
      const files = await listFiles(token, forgetToken)
      if (files.some((f) => f.name === KEYFILE)) throw new Error('A vault already exists in this Google account: use "Unlock existing vault"')
      const v = await createVault(passphrase)
      await upload(token, KEYFILE, JSON.stringify(v.keyFile), forgetToken)
      await db.settings.delete('x:base')
      await this.saveDek(v.dek)
      this.recoveryKey = v.recoveryKey
      await this.sync()
    } catch (e) {
      this.fail(e)
    }
  }

  /** Another device: unlock the existing vault with passphrase (or recovery key). */
  async join(secret: string, mode: 'passphrase' | 'recovery'): Promise<void> {
    try {
      this.status = 'syncing'
      const token = await this.token(true)
      const files = await listFiles(token, forgetToken)
      const kf = files.find((f) => f.name === KEYFILE)
      if (!kf) throw new Error('No vault found in this Google account: create one first')
      const key = await openVault(JSON.parse(await download(token, kf.id, forgetToken)) as KeyFile, secret, mode)
      const hasData = files.some((f) => f.name.startsWith('dev-'))
      if (hasData && store.tasks.length === 0) {
        // fresh device: take the cloud data instead of merging with the empty default list
        await store.wipeAll()
        await db.settings.delete('x:base')
      }
      await this.saveDek(key)
      await this.sync()
    } catch (e) {
      this.fail(e)
    }
  }

  /** Forget the key on this device (cloud data stays). */
  async lock() {
    this.dek = null
    await db.settings.delete('x:dek')
    store.setPref('cloudOn', false)
    this.status = 'off'
    this.message = ''
  }

  async sync(): Promise<void> {
    if (!this.enabled || !this.dek) return
    if (this.running) { this.again = true; return }
    this.running = true
    this.last = this.run()
    await this.last
    this.running = false
    if (this.again) { this.again = false; void this.sync() }
  }

  private async run() {
    const dek = this.dek!
    try {
      this.status = 'syncing'
      let token: string
      try { token = await this.token(false) } catch { this.authNeeded = true; this.status = 'ok'; this.message = ''; return } // paused until the user reconnects

      const me = this.device()
      const myName = `dev-${me}.enc`
      const files = await listFiles(token, forgetToken)
      const base = ((await db.settings.get('x:base'))?.value ?? {}) as Record<string, BaseEnt>

      // 1. local edits
      const now = Math.max(Date.now(), ...Object.values(base).map((b) => b.t + 1))
      let changed = detectLocal(base, await hashAll(store.syncEntities()), me, now)

      // 2. other devices
      const remotes: FileState[] = []
      for (const f of files as DriveFile[]) {
        if (!f.name.startsWith('dev-') || f.name === myName) continue
        try {
          remotes.push(await decryptJson<FileState>(dek, f.name, await download(token, f.id, forgetToken)))
        } catch {
          throw new Error(`Cannot decrypt ${f.name}: the file may be damaged or from another vault`)
        }
      }
      const pending = await mergeRemote(base, remotes)
      if (pending.size) await store.applySync(pending)

      // shared extras (the Calendar id, so every device uses the same "To-Do Reminders" calendar)
      const extras: FileState['extras'] = {}
      const calT = store.pref('gCalIdT', 0)
      let bestCal = { v: store.pref('gCalId', ''), t: calT }
      for (const r of remotes) {
        const c = r.extras?.gCalId
        if (c && typeof c.v === 'string' && c.t > bestCal.t) bestCal = { v: c.v, t: c.t }
      }
      if (bestCal.v && bestCal.v !== store.pref('gCalId', '')) {
        store.setPref('gCalId', bestCal.v)
        store.setPref('gCalIdT', bestCal.t)
        store.setPref('gEvents', {})
        changed = true
      }
      if (bestCal.v) extras.gCalId = bestCal

      // 3. upload my file when something changed
      const mine = files.find((f) => f.name === myName)
      if (changed || pending.size || !mine) {
        purgeTombstones(base, Date.now())
        const local = store.syncEntities()
        const ents: FileState['ents'] = {}
        for (const [k, b] of Object.entries(base)) {
          if (b.del) ents[k] = { t: b.t, by: b.by, del: true }
          else if (k in local) ents[k] = { t: b.t, by: b.by, d: local[k] }
        }
        const state: FileState = { v: 1, device: me, extras, ents }
        await upload(token, myName, await encryptJson(dek, myName, state), forgetToken, mine?.id)
      }
      await db.settings.put({ key: 'x:base', value: base })
      this.lastSync = Date.now()
      store.setPref('cloudLast', this.lastSync)
      this.status = 'ok'
      this.message = ''
    } catch (e) {
      this.fail(e)
    }
  }
}

export const cloud = new Cloud()
