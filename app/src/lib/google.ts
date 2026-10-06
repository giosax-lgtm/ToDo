// Minimal Google OAuth (Google Identity Services token flow). The access token lives in memory only.

const GIS_SRC = 'https://accounts.google.com/gsi/client'

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

declare global {
  interface Window { google?: GoogleGlobal }
}

// One consent covers both features: reminders (Calendar) and encrypted sync (Drive app folder).
export const ALL_SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created', // only calendars/events this app created
  'https://www.googleapis.com/auth/drive.appdata', // hidden app-only folder in Drive
].join(' ')

let loading: Promise<void> | null = null
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

let token: { value: string; exp: number } | null = null

export const hasValidToken = () => !!token && token.exp > Date.now() + 30000

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
          token = { value: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 }
          resolve(r.access_token)
        } else reject(new Error(r.error_description || r.error || 'Google sign-in failed'))
      },
      error_callback: (e) => reject(new Error(e.message || e.type || 'Google sign-in cancelled')),
    })
    client.requestAccessToken({ prompt: interactive ? '' : 'none' })
  })
}

export function revokeToken() {
  if (token && window.google) window.google.accounts.oauth2.revoke(token.value)
  token = null
}

export function forgetToken() {
  token = null
}
