// Test di lib/zip.ts: valore CRC-32 noto e struttura dello zip prodotto.
import { describe, expect, it } from 'vitest'
import { crc32, makeZip } from './zip'

describe('zip', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('writes local headers, central directory and end record', () => {
    const z = makeZip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.txt', data: 'world!' }])
    const v = new DataView(z.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    const end = z.length - 22
    expect(v.getUint32(end, true)).toBe(0x06054b50)
    expect(v.getUint16(end + 10, true)).toBe(2) // number of entries
    // the central directory starts where the end record says
    expect(v.getUint32(v.getUint32(end + 16, true), true)).toBe(0x02014b50)
  })
})
