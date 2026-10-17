// WORKER DI AUTENTICAZIONE (Cloudflare Workers, gratis): permette il login duraturo con Google.
// Google richiede il 'client secret' per scambiare il codice di login con un refresh token e per rinnovare l'access token; il secret non puo' stare
// nell'app (sito statico), quindi sta qui. Il Worker non salva nulla e non vede i tuoi dati: inoltra solo due richieste a Google.
//   POST /token    { code }          -> scambia il codice del popup Google con access token + refresh token
//   POST /refresh  { refresh_token } -> restituisce un nuovo access token (1 ora)
// Variabili (vedi wrangler.toml e SETUP.md C3): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (secret), ALLOWED_ORIGINS (origini dell'app, separate da virgola).
// Usato da: app/src/lib/google.ts (indirizzo impostato in Settings -> Sign-in server).

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Risposta JSON con le intestazioni CORS (solo per origini consentite).
function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } })
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || ''
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 })
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors)

    const path = new URL(req.url).pathname
    let body
    try { body = await req.json() } catch { return json({ error: 'bad_request' }, 400, cors) }

    const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET })
    if (path === '/token' && typeof body.code === 'string') {
      params.set('grant_type', 'authorization_code')
      params.set('code', body.code)
      params.set('redirect_uri', 'postmessage') // value used by the Google popup code flow
    } else if (path === '/refresh' && typeof body.refresh_token === 'string') {
      params.set('grant_type', 'refresh_token')
      params.set('refresh_token', body.refresh_token)
    } else return json({ error: 'bad_request' }, 400, cors)

    const res = await fetch(GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
    const d = await res.json().catch(() => ({}))
    // only the fields the app needs
    return json({ access_token: d.access_token, expires_in: d.expires_in, refresh_token: d.refresh_token, error: d.error, error_description: d.error_description }, res.status, cors)
  },
}
