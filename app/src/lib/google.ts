// AUTENTICAZIONE GOOGLE (OAuth, Google Identity Services, 'token flow'): carica lo script di Google, ottiene e conserva il token di accesso.
// E' lo strato di login condiviso da lib/cloud.svelte.ts (Drive) e lib/gcal.svelte.ts (Calendar); l'unico consenso copre entrambe le funzioni (ALL_SCOPES).
// App.svelte usa hasValidToken() per sapere quando serve rinnovare il login. Il Client ID e' inserito dall'utente in Settings e passato dai chiamanti.

// Minimal Google OAuth (Google Identity Services token flow). The access token (narrow scopes, 1 hour) is kept in
// localStorage only until it expires, so a page refresh does not force a new sign-in.

const GIS_SRC = 'https://accounts.google.com/gsi/client'

// Tipi minimi della libreria Google (risposta del token, client, oggetto globale) per poterla usare senza dipendenze npm.
interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface GoogleGlobal {
  accounts: {
    oauth2: {
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

// Restituisce un token valido; se manca e interactive=true apre il popup Google (solo da gesto dell'utente), altrimenti lancia 'Google sign-in needed'. Usata da cloud.svelte.ts e gcal.svelte.ts.
/**
 * Get an access token. interactive=false tries a silent refresh (works while the browser
 * is signed in to Google and consent was already given); it fails otherwise.
 */
export async function getToken(clientId: string, scope: string, interactive: boolean): Promise<string> {
  if (hasValidToken()) return token!.value
  // Background calls never open Google windows: sign-in only happens on an explicit user action.
  if (!interactive) throw new Error('Google sign-in needed')
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
  if (token && window.google) window.google.accounts.oauth2.revoke(token.value)
  saveToken(null)
}

// Dimentica il token locale senza revocarlo (es. dopo un 401). Passata come onAuthFail alle funzioni di drive.ts e usata da gcal.api().
export function forgetToken() {
  saveToken(null)
}
