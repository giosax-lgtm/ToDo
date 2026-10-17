// AUTENTICAZIONE GOOGLE (OAuth, Google Identity Services, 'token flow'): carica lo script di Google, ottiene e conserva il token di accesso.
// E' lo strato di login condiviso da lib/cloud.svelte.ts (Drive) e lib/gcal.svelte.ts (Calendar); l'unico consenso copre entrambe le funzioni (ALL_SCOPES).
// App.svelte usa hasValidToken() per sapere quando serve rinnovare il login. Il Client ID e' inserito dall'utente in Settings e passato dai chiamanti.

// Minimal Google OAuth (Google Identity Services token flow). The access token (narrow scopes, 1 hour) is kept in
// localStorage only until it expires, so a page refresh does not force a new sign-in.

const GIS_SRC = 'https://accounts.google.com/gsi/client'

// Tipi minimi della libreria Google (risposta del token, client, oggetto globale) per poterla usare senza dipendenze npm.
interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface CodeResponse { code?: string; error?: string; error_description?: string }
interface GoogleGlobal {
  accounts: {
    oauth2: {
      initCodeClient(c: {
        client_id: string
        scope: string
        ux_mode: 'popup'
        callback: (r: CodeResponse) => void
        error_callback?: (e: { type?: string; message?: string }) => void
      }): { requestCode(): void }
      initTokenClient(c: {
        client_id: string
        scope: string
        callback: (r: TokenResponse) => void
        error_callback?: (e: { type?: string; message?: string }) => void
      }): TokenClient
      revoke(token: string, done?: () => void): void
    }
  }
}

// Dichiara window.google, che esiste solo dopo il caricamento dello script GIS (vedi loadGis).
declare global {
  interface Window { google?: GoogleGlobal }
}

// Permessi richiesti: eventi/calendari creati dall'app (Calendar) e cartella nascosta dell'app (Drive appdata).
// One consent covers both features: reminders (Calendar) and encrypted sync (Drive app folder).
export const ALL_SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created', // only calendars/events this app created
  'https://www.googleapis.com/auth/drive.appdata', // hidden app-only folder in Drive
].join(' ')

// Cache della promessa di caricamento dello script, per non inserirlo piu' volte.
let loading: Promise<void> | null = null
// Carica dinamicamente https://accounts.google.com/gsi/client (consentito dalla CSP di index.html). Chiamata da getToken e da cloud.ensureAuth.
export function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { loading = null; reject(new Error('Cannot load Google sign-in (offline?)')) }
    document.head.appendChild(s)
  })
  return loading
}

// Il token e' tenuto in memoria e copiato in localStorage fino alla scadenza, cosi' un refresh della pagina non obbliga a un nuovo login.
const TOKEN_KEY = 'todo.gtoken'
let token: { value: string; exp: number } | null = readToken()

// LOGIN DURATURO (opzionale): se in Settings e' impostato l'indirizzo del piccolo Worker di autenticazione (worker/), il login usa l'
// 'authorization code flow': Google restituisce un refresh token di lunga durata e il Worker (che custodisce il client secret) lo scambia
// con nuovi access token da 1 ora, in silenzio, senza popup. Senza Worker resta il vecchio token flow (login ogni ora).
const REFRESH_KEY = 'todo.grefresh'
let authUrl = ''
let refreshToken: string | null = readRefresh()
let refreshing: Promise<string> | null = null

// Imposta (o toglie) l'indirizzo del Worker di autenticazione. Chiamata da App.svelte quando cambia la preferenza 'gAuthUrl'.
export function setAuthEndpoint(url: string) {
  authUrl = url.trim().replace(/\/+$/, '')
}
// Legge il refresh token da localStorage (una volta, all'avvio del modulo).
function readRefresh(): string | null {
  try { return localStorage.getItem(REFRESH_KEY) || null } catch { return null }
}
// Aggiorna il refresh token in memoria e in localStorage (o lo cancella se null).
function saveRefresh(r: string | null) {
  refreshToken = r
  try { r ? localStorage.setItem(REFRESH_KEY, r) : localStorage.removeItem(REFRESH_KEY) } catch { /* private mode */ }
}
// True se il rinnovo silenzioso e' possibile: esiste un refresh token e il Worker e' configurato.
const canRefresh = () => !!refreshToken && !!authUrl

// Chiama il Worker (POST JSON) e restituisce la risposta di Google; lancia con il messaggio di errore se la richiesta fallisce.
async function callAuth(path: string, body: Record<string, string>): Promise<{ access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string }> {
  let res: Response
  try {
    res = await fetch(authUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch { throw new Error('Cannot reach the sign-in server (offline?)') }
  const d = await res.json().catch(() => ({}))
  if (!res.ok || d.error) {
    const e = new Error(d.error_description || d.error || `Sign-in server error ${res.status}`) as Error & { fatal?: boolean }
    e.fatal = d.error === 'invalid_grant' // the refresh token was revoked/expired: sign-in is really needed again
    throw e
  }
  return d
}

// Ottiene un nuovo access token dal refresh token (senza popup). Richieste simultanee condividono la stessa chiamata.
// Se Google dice 'invalid_grant' (revocato/scaduto) cancella il refresh token; un semplice errore di rete lo conserva per riprovare.
function refreshAccess(): Promise<string> {
  refreshing ??= (async () => {
    try {
      const d = await callAuth('/refresh', { refresh_token: refreshToken! })
      saveToken({ value: d.access_token!, exp: Date.now() + (d.expires_in ?? 3600) * 1000 })
      return d.access_token!
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) saveRefresh(null)
      throw e
    } finally { refreshing = null }
  })()
  return refreshing
}

// Login con popup 'authorization code' di Google + scambio del codice sul Worker. Da chiamare solo da un gesto dell'utente.
async function signInWithCode(clientId: string, scope: string): Promise<string> {
  await loadGis()
  const code = await new Promise<string>((resolve, reject) => {
    window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope,
      ux_mode: 'popup',
      callback: (r) => (r.code ? resolve(r.code) : reject(new Error(r.error_description || r.error || 'Google sign-in failed'))),
      error_callback: (e) => reject(new Error(e.message || e.type || 'Google sign-in cancelled')),
    }).requestCode()
  })
  const d = await callAuth('/token', { code })
  saveToken({ value: d.access_token!, exp: Date.now() + (d.expires_in ?? 3600) * 1000 })
  // Google sends a refresh token only when the consent screen was shown; if this account had already approved the app
  // there is none, and the hourly sign-in stays until access is revoked once (Disconnect, or myaccount.google.com/permissions).
  if (d.refresh_token) saveRefresh(d.refresh_token)
  else if (!refreshToken) throw new Error('Signed in, but Google gave no long-lived login. Press Disconnect (or remove "toDo" at myaccount.google.com/permissions), then Connect again.')
  return d.access_token!
}

// Legge il token da localStorage se ancora valido (usata una volta, all'avvio del modulo).
function readToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null')
    return t && typeof t.value === 'string' && t.exp > Date.now() ? (t as { value: string; exp: number }) : null
  } catch { return null }
}
// Aggiorna il token in memoria e in localStorage (o lo cancella se null). Gli errori di storage (modalita' privata) vengono ignorati.
function saveToken(t: { value: string; exp: number } | null) {
  token = t
  try { t ? localStorage.setItem(TOKEN_KEY, JSON.stringify(t)) : localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
}

// True se esiste un token non in scadenza (margine 30 s). Usata da App.svelte, cloud.svelte.ts e gcal.svelte.ts per decidere se serve un nuovo login.
export const hasValidToken = () => !!token && token.exp > Date.now() + 30000

// True se l'utente e' 'collegato': token valido oppure rinnovabile in silenzio col refresh token. Usata per mostrare 'serve nuovo login' solo quando serve davvero.
export const hasSession = () => hasValidToken() || canRefresh()

// Restituisce un token valido; se manca e interactive=true apre il popup Google (solo da gesto dell'utente), altrimenti lancia 'Google sign-in needed'. Usata da cloud.svelte.ts e gcal.svelte.ts.
/**
 * Get an access token. interactive=false tries a silent refresh (works while the browser
 * is signed in to Google and consent was already given); it fails otherwise.
 */
export async function getToken(clientId: string, scope: string, interactive: boolean): Promise<string> {
  if (hasValidToken()) return token!.value
  if (canRefresh()) {
    try { return await refreshAccess() } catch (e) {
      // network trouble: background calls just retry later; an explicit sign-in falls through to the popup
      if (!interactive || !authUrl) throw e
    }
  }
  // Background calls never open Google windows: sign-in only happens on an explicit user action.
  if (!interactive) throw new Error('Google sign-in needed')
  if (authUrl) return signInWithCode(clientId, scope)
  await loadGis()
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (r) => {
        if (r.access_token) {
          saveToken({ value: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 })
          resolve(r.access_token)
        } else reject(new Error(r.error_description || r.error || 'Google sign-in failed'))
      },
      error_callback: (e) => reject(new Error(e.message || e.type || 'Google sign-in cancelled')),
    })
    client.requestAccessToken({ prompt: interactive ? '' : 'none' })
  })
}

// Revoca il token presso Google e lo dimentica. Usata da gcal.disconnect().
export function revokeToken() {
  // revoking the refresh token also invalidates the access tokens issued from it
  const t = refreshToken ?? token?.value
  if (t && window.google) window.google.accounts.oauth2.revoke(t)
  saveRefresh(null)
  saveToken(null)
}

// Dimentica il token locale senza revocarlo (es. dopo un 401). Passata come onAuthFail alle funzioni di drive.ts e usata da gcal.api().
export function forgetToken() {
  saveToken(null)
}
