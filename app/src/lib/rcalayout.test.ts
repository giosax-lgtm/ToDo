import { describe, expect, it } from 'vitest'
import { layoutRca, subtreeIds, wrap } from './rcalayout'
import type { Rca } from './types'

const mk = (kind: Rca['kind'], nodes: [string, string | null, string][]): Rca => ({
  id: 'r', projectId: 'p', kind, title: 't', updated: 0, nodes: nodes.map(([id, parentId, text]) => ({ id, parentId, text })),
})
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('rcalayout', () => {
  it('wrap never returns empty and splits long words', () => {
    expect(wrap('', 200)).toEqual([''])
    expect(wrap('x'.repeat(100), 100).length).toBeGreaterThan(1)
  })
  it('whys: boxes do not overlap and parent sits left of children', () => {
    const r = mk('whys', [['a', null, 'Problem'], ['b', 'a', 'why one is quite a long text that wraps'], ['c', 'a', 'why two'], ['d', 'b', 'deeper'], ['e', 'b', 'deeper 2']])
    const l = layoutRca(r)
    expect(l.boxes).toHaveLength(5)
    for (const a of l.boxes) for (const b of l.boxes) if (a !== b) expect(overlap(a, b)).toBe(false)
    const x = (id: string) => l.boxes.find((b) => b.id === id)!.x
    expect(x('a')).toBeLessThan(x('b'))
    expect(x('b')).toBeLessThan(x('d'))
  })
  it('fishbone: no overlaps with many causes on several categories', () => {
    const nodes: [string, string | null, string][] = [['h', null, 'Defects']]
    for (let c = 0; c < 6; c++) {
      nodes.push([`c${c}`, 'h', `Cat ${c}`])
      for (let k = 0; k < 4; k++) {
        nodes.push([`c${c}k${k}`, `c${c}`, `cause ${c}.${k} with some more words`])
        if (k % 2) nodes.push([`c${c}k${k}s`, `c${c}k${k}`, 'sub cause'])
      }
    }
    const l = layoutRca(mk('fishbone', nodes))
    expect(l.boxes).toHaveLength(nodes.length)
    for (const a of l.boxes) {
      expect(a.x).toBeGreaterThanOrEqual(0)
      expect(a.y).toBeGreaterThanOrEqual(0)
      expect(a.x + a.w).toBeLessThanOrEqual(l.width)
      expect(a.y + a.h).toBeLessThanOrEqual(l.height)
      for (const b of l.boxes) if (a !== b) expect(overlap(a, b)).toBe(false)
    }
  })
  it('fault tree: gates sit between an event and its children, no overlaps', () => {
    const r = mk('faulttree', [['t', null, 'Top failure'], ['a', 't', 'Pump fails'], ['b', 't', 'No power'], ['c', 'a', 'Seal worn'], ['d', 'a', 'Bearing seized'], ['e', 'a', 'Dry run']])
    const l = layoutRca(r)
    expect(l.boxes.filter((b) => b.role === 'gate')).toHaveLength(2)
    for (const a of l.boxes) for (const b of l.boxes) if (a !== b) expect(overlap(a, b)).toBe(false)
    const y = (id: string) => l.boxes.find((b) => b.id === id)!.y
    expect(y('t')).toBeLessThan(y('gate:t'))
    expect(y('gate:t')).toBeLessThan(y('a'))
    expect(y('a')).toBeLessThan(y('c'))
  })
  it('ruled-out branch is flagged on node, descendants and its line (cross only on the first node); hot path to root cause', () => {
    const r = mk('whys', [['a', null, 'P'], ['b', 'a', 'hyp 1'], ['c', 'b', 'test fails'], ['d', 'a', 'hyp 2'], ['e', 'd', 'real']])
    r.nodes[1].out = true
    r.nodes[4].cause = true
    const l = layoutRca(r)
    const box = (id: string) => l.boxes.find((b) => b.id === id)!
    expect(box('b').out && box('c').out).toBe(true)
    expect(box('d').out).toBe(false)
    expect(l.lines.filter((x) => x.cross)).toHaveLength(1)
    expect(l.lines.filter((x) => x.out)).toHaveLength(2)
    expect(box('e').hot && box('d').hot && box('a').hot).toBe(true)
    expect(box('b').hot).toBeFalsy()
  })
  it('subtreeIds collects descendants', () => {
    const r = mk('whys', [['a', null, ''], ['b', 'a', ''], ['c', 'b', ''], ['d', 'a', '']])
    expect(subtreeIds(r.nodes, 'b').sort()).toEqual(['b', 'c'])
  })
})
