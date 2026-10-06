// BACKUP CIFRATO su file. Esporta tutti i dati (liste, task, tag, viste) in un file JSON protetto da una passphrase e li reimporta.
// Usa store.syncEntities()/applySync()/wipeAll() (lib/store.svelte.ts) per leggere e scrivere i dati, e le primitive di lib/crypto.ts per la cifratura
// (PBKDF2 + AES-GCM). E' indipendente dalla sync su Drive (lib/cloud.svelte.ts). Richiamato dalla sezione Backup di Settings.svelte.

import { store } from './store.svelte'
import { b64, decryptJson, deriveKek, encryptJson, PBKDF2_ITER, rand, unb64 } from './crypto'

// Formato del file di backup: versione, iterazioni PBKDF2, salt (base64) e dati cifrati (base64).
interface BackupFile { v: 1; iter: number; salt: string; data: string }
// Contenuto in chiaro (prima della cifratura): istante dell'export e mappa 'tabella:id' -> record, la stessa di store.syncEntities().
interface Payload { v: 1; at: number; ents: Record<string, unknown> }

// Crea il file di backup: deriva la chiave dalla passphrase con un salt casuale, cifra il Payload e restituisce un Blob da scaricare. Chiamata da Settings.doExport().
/** Passphrase-encrypted backup of everything (lists, items, tags, views). */
export async function exportBackup(passphrase: string): Promise<Blob> {
  const salt = rand(16)
  const key = await deriveKek(passphrase, salt)
  const payload: Payload = { v: 1, at: Date.now(), ents: store.syncEntities() }
  const file: BackupFile = { v: 1, iter: PBKDF2_ITER, salt: b64(salt), data: await encryptJson(key, 'backup', payload) }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

// Ripristina un backup: decifra con la passphrase (errore se sbagliata/file rovinato), POI cancella tutti i dati locali (store.wipeAll) e scrive quelli del backup (store.applySync).
// Restituisce il numero di record importati. Chiamata da Settings.doImport().
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
