// CLIENT MINIMALE DI GOOGLE DRIVE (REST) limitato alla cartella nascosta 'appDataFolder' (scope drive.appdata): visibile solo a questa app.
// Usato esclusivamente da lib/cloud.svelte.ts per elencare, scaricare e caricare i file cifrati (keyfile.json e dev-<id>.enc).
// Il token OAuth arriva da lib/google.ts; ogni funzione riceve una callback onAuthFail che cloud.svelte.ts imposta su forgetToken (token scaduto -> 401).

// Endpoint base per i metadati e per l'upload dell'API Drive v3.
// Google Drive appDataFolder: a hidden folder only this app can see (scope drive.appdata).
const D = 'https://www.googleapis.com/drive/v3'
const U = 'https://www.googleapis.com/upload/drive/v3'

// Metadati minimi di un file Drive: id e nome.
export interface DriveFile { id: string; name: string }

// Controlla la risposta HTTP: su 401 invoca onAuthFail (token da dimenticare), su altri errori lancia un'eccezione leggibile. Usata da tutte le funzioni qui sotto.
async function check(res: Response, what: string, onAuthFail: () => void) {
  if (res.status === 401) onAuthFail()
  if (!res.ok) throw new Error(`Drive ${what} failed (${res.status})`)
  return res
}

// Elenca i file (max 200) della cartella dell'app. cloud.svelte.ts li usa per trovare keyfile.json e i file dei dispositivi.
export async function listFiles(token: string, onAuthFail: () => void): Promise<DriveFile[]> {
  const url = `${D}/files?spaces=appDataFolder&pageSize=200&fields=files(id,name)`
  const res = await check(await fetch(url, { headers: { Authorization: 'Bearer ' + token } }), 'list', onAuthFail)
  return ((await res.json()) as { files: DriveFile[] }).files
}

// Scarica il contenuto testuale di un file dato l'id (contenuto cifrato da decifrare con lib/crypto.ts).
export async function download(token: string, id: string, onAuthFail: () => void): Promise<string> {
  const res = await check(
    await fetch(`${D}/files/${id}?alt=media`, { headers: { Authorization: 'Bearer ' + token } }),
    'download',
    onAuthFail,
  )
  return res.text()
}

// Crea (senza id, upload multipart con genitore appDataFolder) o sovrascrive (con id, PATCH) un file di testo. Restituisce l'id.
/** Create (no id) or overwrite (id) a text file in the app folder. Returns the file id. */
export async function upload(token: string, name: string, content: string, onAuthFail: () => void, id?: string): Promise<string> {
  const auth = { Authorization: 'Bearer ' + token }
  if (id) {
    const res = await check(
      await fetch(`${U}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'text/plain' }, body: content }),
      'update',
      onAuthFail,
    )
    return ((await res.json()) as { id: string }).id
  }
  const boundary = 'b' + crypto.randomUUID().replace(/-/g, '')
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: ['appDataFolder'] }) +
    `\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--`
  const res = await check(
    await fetch(`${U}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }),
    'create',
    onAuthFail,
  )
  return ((await res.json()) as { id: string }).id
}
