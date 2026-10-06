// Google Drive appDataFolder: a hidden folder only this app can see (scope drive.appdata).
const D = 'https://www.googleapis.com/drive/v3'
const U = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile { id: string; name: string }

async function check(res: Response, what: string, onAuthFail: () => void) {
  if (res.status === 401) onAuthFail()
  if (!res.ok) throw new Error(`Drive ${what} failed (${res.status})`)
  return res
}

export async function listFiles(token: string, onAuthFail: () => void): Promise<DriveFile[]> {
  const url = `${D}/files?spaces=appDataFolder&pageSize=200&fields=files(id,name)`
  const res = await check(await fetch(url, { headers: { Authorization: 'Bearer ' + token } }), 'list', onAuthFail)
  return ((await res.json()) as { files: DriveFile[] }).files
}

export async function download(token: string, id: string, onAuthFail: () => void): Promise<string> {
  const res = await check(
    await fetch(`${D}/files/${id}?alt=media`, { headers: { Authorization: 'Bearer ' + token } }),
    'download',
    onAuthFail,
  )
  return res.text()
}

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
