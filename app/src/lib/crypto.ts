// PRIMITIVE DI CIFRATURA (solo WebCrypto, nessuna dipendenza). Gerarchia delle chiavi: una chiave dati casuale (DEK, AES-256-GCM) cifra i dati;
// la DEK e' salvata nel cloud solo 'incartata' (wrapped) due volte: con una chiave derivata dalla passphrase (PBKDF2) e con una chiave di recupero casuale.
// Usato da lib/cloud.svelte.ts (vault, cifratura dei file dei dispositivi), lib/backup.ts (backup su file) e lib/merge.ts (hash e JSON stabile).

// End-to-end encryption helpers (WebCrypto only, no dependencies).
//
// Key hierarchy:
//   DEK (random AES-256-GCM key)  encrypts all synced data
//   DEK is stored in the cloud only wrapped: once by a key derived from the passphrase (PBKDF2),
//   once by a random 256-bit recovery key. Google never sees the passphrase, recovery key or DEK.

// Encoder/decoder di testo UTF-8 e numero di iterazioni PBKDF2 (esportato perche' lo scrive anche il file di backup).
const enc = new TextEncoder()
const dec = new TextDecoder()
export const PBKDF2_ITER = 600_000

// Uint8Array -> base64 (a blocchi per non superare il limite degli argomenti di String.fromCharCode).
export const b64 = (u: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
// Base64 -> Uint8Array (inverso di b64).
export const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
// Genera n byte casuali crittograficamente sicuri (salt, IV, chiavi).
export const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
// Adattatore di tipo: fa accettare un Uint8Array dove WebCrypto richiede BufferSource.
const buf = (u: Uint8Array) => u as unknown as BufferSource

// Serializza in JSON con chiavi ordinate: dati uguali producono sempre lo stesso testo (e lo stesso hash). Usata da merge.ts per rilevare le modifiche.
/** JSON with sorted keys, so equal data always gives equal text (and equal hashes). */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  )
}

// SHA-256 del testo, accorciato a 22 caratteri base64: impronta del contenuto di un record (usata da merge.ts).
export async function hash(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return b64(new Uint8Array(d)).slice(0, 22)
}

// ---------- keys ----------
// Deriva dalla passphrase (PBKDF2-SHA256, salt e iterazioni dati) la chiave che incarta/scarta la DEK. Usata da createVault, openVault e backup.ts.
export async function deriveKek(passphrase: string, salt: Uint8Array, iter = PBKDF2_ITER): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: buf(salt), iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// Genera i 32 byte casuali di una nuova DEK.
export const newDekBytes = () => rand(32)

// Importa i byte della DEK come chiave AES-GCM NON estraibile (non puo' essere letta da JavaScript, solo usata).
export const importDek = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', buf(raw), 'AES-GCM', false, ['encrypt', 'decrypt']) // non-extractable

// Importa byte grezzi come chiave AES-GCM (usata per la chiave di recupero).
const importRaw = (raw: Uint8Array) => crypto.subtle.importKey('raw', buf(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])

// Dato cifrato con il proprio IV, entrambi in base64.
export interface Wrapped { iv: string; ct: string }

// Cifra (incarta) dei byte con una chiave AES-GCM generando un IV casuale.
async function wrap(key: CryptoKey, raw: Uint8Array): Promise<Wrapped> {
  const iv = rand(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(raw)))
  return { iv: b64(iv), ct: b64(ct) }
}

// Operazione inversa di wrap: decifra e restituisce i byte (lancia se la chiave e' sbagliata).
async function unwrap(key: CryptoKey, w: Wrapped): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(unb64(w.iv)) }, key, buf(unb64(w.ct))))
}

// Contenuto di keyfile.json su Drive: parametri KDF, salt e la DEK incartata con passphrase e con chiave di recupero.
export interface KeyFile {
  v: 1
  kdf: 'PBKDF2-SHA256'
  iter: number
  salt: string
  pass: Wrapped
  recovery: Wrapped
}

// Formatta la chiave di recupero (64 caratteri esadecimali) a gruppi di 8 separati da trattini, per mostrarla all'utente.
/** "xxxxxxxx-xxxxxxxx-..." (64 hex chars) */
export const formatRecovery = (raw: Uint8Array) =>
  Array.from(raw, (b) => b.toString(16).padStart(2, '0')).join('').match(/.{8}/g)!.join('-')

// Interpreta la chiave di recupero digitata dall'utente (ignora separatori e maiuscole); errore se non ha 64 cifre esadecimali.
export const parseRecovery = (text: string): Uint8Array => {
  const hex = text.replace(/[^0-9a-f]/gi, '').toLowerCase()
  if (hex.length !== 64) throw new Error('Recovery key must have 64 hex characters')
  return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16))
}

// Crea un nuovo vault (primo dispositivo): DEK casuale, KeyFile con le due incartature e chiave di recupero. Chiamata da cloud.create(); il KeyFile va caricato su Drive.
export async function createVault(passphrase: string) {
  const dek = newDekBytes()
  const salt = rand(16)
  const recoveryRaw = rand(32)
  const kek = await deriveKek(passphrase, salt)
  const keyFile: KeyFile = {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: PBKDF2_ITER,
    salt: b64(salt),
    pass: await wrap(kek, dek),
    recovery: await wrap(await importRaw(recoveryRaw), dek),
  }
  return { keyFile, recoveryKey: formatRecovery(recoveryRaw), dek: await importDek(dek) }
}

// Apre un vault esistente con passphrase o chiave di recupero e restituisce la DEK. Errori chiari ('Wrong passphrase'/'Wrong recovery key'). Chiamata da cloud.join().
export async function openVault(kf: KeyFile, secret: string, mode: 'passphrase' | 'recovery'): Promise<CryptoKey> {
  try {
    const raw =
      mode === 'passphrase'
        ? await unwrap(await deriveKek(secret, unb64(kf.salt), kf.iter), kf.pass)
        : await unwrap(await importRaw(parseRecovery(secret)), kf.recovery)
    return importDek(raw)
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Recovery key')) throw e
    throw new Error(mode === 'passphrase' ? 'Wrong passphrase' : 'Wrong recovery key')
  }
}

// ---------- data files ----------
// Passa dei byte attraverso un CompressionStream/DecompressionStream (gzip) e ne restituisce il risultato.
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([buf(data)]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

// Comprime (gzip) e cifra (AES-GCM) un valore JSON; 'name' e' dato autenticato, quindi un file non puo' essere scambiato con un altro. Restituisce base64. Usata da cloud.run() e backup.ts.
/** gzip + AES-GCM; `name` is authenticated so a file cannot be swapped for another. Returns base64 text. */
export async function encryptJson(key: CryptoKey, name: string, value: unknown): Promise<string> {
  const packed = await pipe(enc.encode(JSON.stringify(value)), new CompressionStream('gzip'))
  const iv = rand(12)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(enc.encode(name)) }, key, buf(packed)),
  )
  const out = new Uint8Array(1 + 12 + ct.length)
  out[0] = 1
  out.set(iv, 1)
  out.set(ct, 13)
  return b64(out)
}

// Inverso di encryptJson: verifica formato e 'name', decifra, decomprime e interpreta il JSON. Usata da cloud.run() e backup.importBackup().
export async function decryptJson<T>(key: CryptoKey, name: string, text: string): Promise<T> {
  const all = unb64(text.trim())
  if (all[0] !== 1) throw new Error('Unknown file format')
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buf(all.slice(1, 13)), additionalData: buf(enc.encode(name)) },
      key,
      buf(all.slice(13)),
    ),
  )
  return JSON.parse(dec.decode(await pipe(plain, new DecompressionStream('gzip')))) as T
}
