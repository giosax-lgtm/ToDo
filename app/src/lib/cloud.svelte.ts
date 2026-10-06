// SINCRONIZZAZIONE CIFRATA TRA DISPOSITIVI su Google Drive (cartella nascosta dell'app). Esporta il singleton 'cloud' (stato reattivo + azioni).
// Come funziona: ogni dispositivo scrive il proprio file cifrato 'dev-<id>.enc' (tutti i suoi record) e legge quelli degli altri; i conflitti si risolvono
// per singolo record con lib/merge.ts. La chiave dati (DEK) e' protetta da passphrase + chiave di recupero (lib/crypto.ts, keyfile.json).
// Dipende da: lib/drive.ts (file su Drive), lib/google.ts (token), lib/crypto.ts, lib/merge.ts, lib/store.svelte.ts (dati) e lib/db.ts (chiavi locali 'x:dek'/'x:base').
// Chiamato da: App.svelte (avvio, timer, eventi), Settings.svelte (crea/sblocca/sync manuale), Sidebar.svelte (indicatore di stato) e gcal.svelte.ts
// (il calendario deve usare lo stesso id su tutti i dispositivi: 'extras.gCalId').

import { db } from './db'
import { store } from './store.svelte'
import { ALL_SCOPES, forgetToken, getToken, hasValidToken, loadGis } from './google'
import { listFiles, download, upload, type DriveFile } from './drive'
import { createVault, decryptJson, encryptJson, openVault, type KeyFile } from './crypto'
import { detectLocal, hashAll, mergeRemote, purgeTombstones, type BaseEnt, type FileState } from './merge'

// Nome del file su Drive che contiene la DEK incartata (passphrase + recupero).
const KEYFILE = 'keyfile.json'

// Opzioni di frequenza mostrate in Settings: [chiave, etichetta, minuti]. 0 = subito dopo ogni modifica, null = solo manuale. La scelta e' in store.pref('syncFreq').
/** Automatic sync frequency options (minutes; 0 = instant, null = manual only). */
export const SYNC_FREQ: [string, string, number | null][] = [
  ['instant', 'Automatic: a few seconds after each change (and every minute)', 0],
  ['15m', 'Every 15 minutes', 15],
  ['1h', 'Every hour', 60],
  ['6h', 'Every 6 hours', 360],
  ['24h', 'Once a day', 1440],
  ['manual', 'Manual only (Sync now button)', null],
]

// Servizio di sync. Lo stato reattivo ($state) e' letto da Sidebar.svelte e Settings.svelte per mostrare lo stato della sincronizzazione.
class Cloud {
  // Stato osservabile: stato corrente, messaggio d'errore, ultimo sync riuscito, 'serve nuovo login Google' e chiave di recupero da mostrare una sola volta.
  status = $state<'off' | 'locked' | 'syncing' | 'ok' | 'error'>('off')
  message = $state('')
  lastSync = $state<number | null>(null)
  /** True when Google sign-in must be renewed (token lives in memory only and lasts 1 hour). */
  authNeeded = $state(false)
  /** Shown once after creating a vault. */
  recoveryKey = $state<string | null>(null)

  // Stato interno: DEK in memoria, flag per evitare sync concorrenti ('running'), richiesta di rilancio ('again') e promessa dell'ultima sync ('last').
  private dek: CryptoKey | null = null
  private running = false
  private again = false
  private last: Promise<void> = Promise.resolve()

  // True se la sync cifrata e' attiva su questo dispositivo (preferenza 'cloudOn').
  get enabled() { return store.pref('cloudOn', false) }
  // Frequenza di sync scelta dall'utente (preferenza 'syncFreq', default 'instant').
  get freq() { return store.pref('syncFreq', 'instant') }

  // Punto d'ingresso dei trigger automatici: App.svelte lo chiama dopo una modifica ('change'), a timer ('tick') e all'avvio ('start').
  // Decide se sincronizzare in base alla frequenza scelta (SYNC_FREQ) e a quando e' avvenuto l'ultimo sync.
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
  // Client ID OAuth inserito dall'utente in Settings (preferenza 'gClientId').
  private get clientId() { return store.pref('gClientId', '').trim() }

  // Id breve e stabile di questo dispositivo (generato la prima volta e salvato): nomina il file dev-<id>.enc e fa da 'autore' nelle versioni dei record.
  private device(): string {
    let d = store.pref('syncDevice', '')
    if (!d) { d = crypto.randomUUID().slice(0, 8); store.setPref('syncDevice', d) }
    return d
  }

  // Chiamata da App.svelte all'avvio: se la sync e' attiva, ricarica ultimo sync e DEK salvata (db settings 'x:dek'); stato 'ok' se la chiave c'e', altrimenti 'locked'.
  async init() {
    if (!this.enabled) { this.status = 'off'; return }
    this.lastSync = store.pref('cloudLast', 0) || null
    this.dek = ((await db.settings.get('x:dek'))?.value as CryptoKey | undefined) ?? null
    this.status = this.dek ? 'ok' : 'locked'
  }

  // Si assicura di avere un token Google valido. Con interactive=false si limita a segnalare 'authNeeded'; con true apre il popup (deve partire da un click).
  // Chiamata da App.svelte (rinnovo al click) e dai pulsanti 'Sync now'/'Recreate calendar' di Settings.svelte.
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

  // Promessa che si risolve a fine sync: gcal.svelte.ts la attende per usare l'id del calendario condiviso dagli altri dispositivi.
  /** Resolves when the running/last sync has finished (used so Calendar waits for the shared calendar id). */
  ready(): Promise<void> { return this.enabled ? this.last : Promise.resolve() }

  // Registra un errore: stato 'error' e messaggio (mostrato in Settings e Sidebar).
  private fail(e: unknown) {
    this.status = 'error'
    this.message = (e as Error).message || String(e)
  }

  // Ottiene il token Google (senza popup se interactive=false) per i permessi ALL_SCOPES; errore se manca il Client ID.
  private async token(interactive: boolean) {
    if (!this.clientId) throw new Error('Enter your Google OAuth Client ID first')
    return getToken(this.clientId, ALL_SCOPES, interactive)
  }

  // Tiene la DEK in memoria e la salva (non estraibile) in IndexedDB; attiva la preferenza 'cloudOn'.
  private async saveDek(key: CryptoKey) {
    this.dek = key
    await db.settings.put({ key: 'x:dek', value: key }) // non-extractable key stored locally
    store.setPref('cloudOn', true)
  }

  // PRIMO DISPOSITIVO: controlla che non esista gia' un vault, crea il vault (crypto.createVault), carica keyfile.json su Drive, salva la DEK, espone la chiave di recupero e fa la prima sync. Chiamata da Settings.create().
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

  // ALTRO DISPOSITIVO: scarica keyfile.json, apre il vault con passphrase o chiave di recupero e sincronizza. Se il dispositivo e' vuoto e nel cloud ci sono dati, scarta la lista di esempio per prendere quelli del cloud. Chiamata da Settings.join().
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

  // Dimentica la chiave su questo dispositivo e disattiva la sync (i dati nel cloud restano). Chiamata da Settings.svelte.
  /** Forget the key on this device (cloud data stays). */
  async lock() {
    this.dek = null
    await db.settings.delete('x:dek')
    store.setPref('cloudOn', false)
    this.status = 'off'
    this.message = ''
  }

  // Avvia una sincronizzazione senza mai farne due in parallelo: se una e' in corso ne programma un'altra subito dopo ('again').
  async sync(): Promise<void> {
    if (!this.enabled || !this.dek) return
    if (this.running) { this.again = true; return }
    this.running = true
    this.last = this.run()
    await this.last
    this.running = false
    if (this.again) { this.again = false; void this.sync() }
  }

  // Il ciclo di sync completo: (1) rileva modifiche locali, (2) scarica e decifra i file degli altri dispositivi e li fonde (merge.ts), applicando le modifiche allo store,
  // gestisce l'id condiviso del calendario Google, (3) ricarica il proprio file se qualcosa e' cambiato, poi salva la 'base' e l'orario dell'ultima sync.
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

// Istanza unica del servizio, importata da App.svelte, Settings.svelte, Sidebar.svelte e gcal.svelte.ts.
export const cloud = new Cloud()
