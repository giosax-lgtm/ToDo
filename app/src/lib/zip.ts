// MINI WRITER DI FILE ZIP (senza compressione, "stored"), senza dipendenze. Serve a lib/noteexport.ts per costruire il file .docx (un docx e' uno zip di file XML).
// Codice puro (niente DOM): testato in zip.test.ts.

// Tabella CRC-32 (polinomio standard 0xEDB88320), calcolata una volta sola.
const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

// CRC-32 di un blocco di byte (richiesto dal formato zip per ogni file).
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Crea uno zip con i file indicati (nome -> testo UTF-8 o byte). Nomi in UTF-8. Restituisce i byte del file .zip.
export function makeZip(files: { name: string; data: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  // Scrive un intero little-endian di 'bytes' byte in una vista.
  const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, true)
  const u32 = (v: DataView, o: number, x: number) => v.setUint32(o, x, true)
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const crc = crc32(data)
    // Intestazione locale (30 byte) + nome + dati.
    const lh = new Uint8Array(30 + name.length)
    const lv = new DataView(lh.buffer)
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, 0); u16(lv, 12, 0x21)
    u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, name.length); u16(lv, 28, 0)
    lh.set(name, 30)
    parts.push(lh, data)
    // Voce della directory centrale (46 byte) + nome.
    const ch = new Uint8Array(46 + name.length)
    const cv = new DataView(ch.buffer)
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, 0); u16(cv, 14, 0x21)
    u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length); u16(cv, 28, name.length)
    u32(cv, 42, offset)
    ch.set(name, 46)
    central.push(ch)
    offset += lh.length + data.length
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, cdSize); u32(ev, 16, offset)
  const all = [...parts, ...central, end]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of all) { out.set(p, o); o += p.length }
  return out
}
