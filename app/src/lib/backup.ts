import { store } from './store.svelte'
import { b64, decryptJson, deriveKek, encryptJson, PBKDF2_ITER, rand, unb64 } from './crypto'

interface BackupFile { v: 1; iter: number; salt: string; data: string }
interface Payload { v: 1; at: number; ents: Record<string, unknown> }

/** Passphrase-encrypted backup of everything (lists, items, tags, views). */
export async function exportBackup(passphrase: string): Promise<Blob> {
  const salt = rand(16)
  const key = await deriveKek(passphrase, salt)
  const payload: Payload = { v: 1, at: Date.now(), ents: store.syncEntities() }
  const file: BackupFile = { v: 1, iter: PBKDF2_ITER, salt: b64(salt), data: await encryptJson(key, 'backup', payload) }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

/** Replaces ALL local data with the backup. */
export async function importBackup(text: string, passphrase: string): Promise<number> {
  let file: BackupFile
  try { file = JSON.parse(text) as BackupFile } catch { throw new Error('Not a backup file') }
  if (file.v !== 1 || !file.salt || !file.data) throw new Error('Not a backup file')
  let payload: Payload
  try {
    payload = await decryptJson<Payload>(await deriveKek(passphrase, unb64(file.salt), file.iter), 'backup', file.data)
  } catch {
    throw new Error('Wrong passphrase or damaged file')
  }
  await store.wipeAll()
  await store.applySync(new Map(Object.entries(payload.ents)))
  return Object.keys(payload.ents).length
}
