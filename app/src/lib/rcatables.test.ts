import { describe, expect, it } from 'vitest'
import { paretoRows } from './rcatables'

describe('paretoRows', () => {
  it('sorts desc, accumulates, and marks the vital few up to 80%', () => {
    const rows = paretoRows([
      { id: 'a', text: 'a', n: 5 },
      { id: 'b', text: 'b', n: 50 },
      { id: 'c', text: 'c', n: 30 },
      { id: 'd', text: 'd', n: 15 },
      { id: 'z', text: 'zero', n: 0 },
    ])
    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'd', 'a'])
    expect(rows.map((r) => Math.round(r.cum))).toEqual([50, 80, 95, 100])
    expect(rows.map((r) => r.vital)).toEqual([true, true, false, false])
  })
  it('empty input gives no rows', () => {
    expect(paretoRows([])).toEqual([])
  })
})
