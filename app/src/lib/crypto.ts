// End-to-end encryption helpers (WebCrypto only, no dependencies).
//
// Key hierarchy:
//   DEK (random AES-256-GCM key)  encrypts all synced data
//   DEK is stored in the cloud only wrapped: once by a key derived from the passphrase (PBKDF2),
//   once by a random 256-bit recovery key. Google never sees the passphrase, recovery key or DEK.

const enc = new TextEncoder()
const dec = new TextDecoder()
export const PBKDF2_ITER = 600_000

export const b64 = (u: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const buf = (u: Uint8Array) => u as unknown as BufferSource

/** JSON with sorted keys, so equal data always gives equal text (and equal hashes). */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  )
}

export async function hash(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return b64(new Uint8Array(d)).slice(0, 22)
}

// ---------- keys ----------
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

export const newDekBytes = () => rand(32)

export const importDek = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', buf(raw), 'AES-GCM', false, ['encrypt', 'decrypt']) // non-extractable

const importRaw = (raw: Uint8Array) => crypto.subtle.importKey('raw', buf(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])

export interface Wrapped { iv: string; ct: string }

async function wrap(key: CryptoKey, raw: Uint8Array): Promise<Wrapped> {
  const iv = rand(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(raw)))
  return { iv: b64(iv), ct: b64(ct) }
}

async function unwrap(key: CryptoKey, w: Wrapped): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(unb64(w.iv)) }, key, buf(unb64(w.ct))))
}

export interface KeyFile {
  v: 1
  kdf: 'PBKDF2-SHA256'
  iter: number
  salt: string
  pass: Wrapped
  recovery: Wrapped
}

/** "xxxxxxxx-xxxxxxxx-..." (64 hex chars) */
export const formatRecovery = (raw: Uint8Array) =>
  Array.from(raw, (b) => b.toString(16).padStart(2, '0')).join('').match(/.{8}/g)!.join('-')

export const parseRecovery = (text: string): Uint8Array => {
  const hex = text.replace(/[^0-9a-f]/gi, '').toLowerCase()
  if (hex.length !== 64) throw new Error('Recovery key must have 64 hex characters')
  return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16))
}

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
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([buf(data)]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

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
