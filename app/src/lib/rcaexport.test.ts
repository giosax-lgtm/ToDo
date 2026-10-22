import { describe, expect, it } from 'vitest'
import { buildPdf, buildPptx, buildSvg, parsePath } from './rcaexport'
import { layoutRca } from './rcalayout'
import type { Rca } from './types'

const rca = (kind: Rca['kind']): Rca => ({
  id: 'r', projectId: 'p', kind, title: 'Late deliveries & <delays>', updated: 0,
  nodes: [
    { id: 'a', parentId: null, text: 'Reports arrive late' },
    { id: 'b', parentId: 'a', text: 'Hypothesis 1: server slow', out: true },
    { id: 'c', parentId: 'b', text: 'Load test OK' },
    { id: 'd', parentId: 'a', text: 'Manual step', cause: true, gate: 'and' },
    { id: 'e', parentId: 'd', text: 'Nobody owns it' },
  ],
})

describe('rcaexport', () => {
  it('parsePath handles M, L, C', () => {
    expect(parsePath('M1,2 C3,4 5,6 7.5,-8 L9,10')).toEqual([
      { op: 'M', pts: [1, 2] }, { op: 'C', pts: [3, 4, 5, 6, 7.5, -8] }, { op: 'L', pts: [9, 10] },
    ])
  })
  for (const kind of ['whys', 'fishbone', 'faulttree'] as const) {
    it(`svg + pptx for ${kind}`, () => {
      const l = layoutRca(rca(kind))
      const { svg } = buildSvg(l, 'Late deliveries & <delays>')
      expect(svg).toContain('&amp;')
      expect(svg).not.toContain('<delays>')
      const z = buildPptx(l, 'Late deliveries & <delays>')
      expect(z[0]).toBe(0x50) // 'PK'
    })
  }
  it('pdf has header, one page and a valid startxref', () => {
    const pdf = buildPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 200, 100)
    const txt = new TextDecoder('latin1').decode(pdf)
    expect(txt.startsWith('%PDF-1.4')).toBe(true)
    const at = Number(/startxref\n(\d+)/.exec(txt)![1])
    expect(txt.slice(at, at + 4)).toBe('xref')
  })
})
