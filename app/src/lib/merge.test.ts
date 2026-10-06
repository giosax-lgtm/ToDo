import { describe, expect, it } from 'vitest'
import { detectLocal, hashAll, mergeRemote, type BaseEnt, type FileState } from './merge'

const file = (device: string, ents: FileState['ents']): FileState => ({ v: 1, device, extras: {}, ents })

describe('sync merge', () => {
  it('detects local edits and deletions', async () => {
    const base: Record<string, BaseEnt> = {}
    expect(detectLocal(base, await hashAll({ 'tasks:1': { a: 1 } }), 'A', 10)).toBe(true)
    expect(base['tasks:1'].t).toBe(10)
    expect(detectLocal(base, await hashAll({ 'tasks:1': { a: 1 } }), 'A', 20)).toBe(false) // unchanged
    expect(detectLocal(base, await hashAll({ 'tasks:1': { a: 2 } }), 'A', 30)).toBe(true)
    expect(detectLocal(base, {}, 'A', 40)).toBe(true)
    expect(base['tasks:1'].del).toBe(true)
  })

  it('newest edit wins, regardless of order', async () => {
    const base: Record<string, BaseEnt> = { 'tasks:1': { h: 'x', t: 50, by: 'A' } }
    const p = await mergeRemote(base, [file('B', { 'tasks:1': { t: 60, by: 'B', d: { v: 'b' } } })])
    expect(p.get('tasks:1')).toEqual({ v: 'b' })
    const p2 = await mergeRemote(base, [file('C', { 'tasks:1': { t: 55, by: 'C', d: { v: 'old' } } })])
    expect(p2.size).toBe(0) // older edit ignored
  })

  it('a newer deletion removes the record, an older one does not', async () => {
    const base: Record<string, BaseEnt> = { 'tasks:1': { h: 'x', t: 50, by: 'A' } }
    const old = await mergeRemote(base, [file('B', { 'tasks:1': { t: 40, by: 'B', del: true } })])
    expect(old.size).toBe(0)
    const fresh = await mergeRemote(base, [file('B', { 'tasks:1': { t: 70, by: 'B', del: true } })])
    expect(fresh.get('tasks:1')).toBeNull()
  })

  it('new remote records are added and equal versions are not re-applied', async () => {
    const base: Record<string, BaseEnt> = {}
    const f = file('B', { 'tasks:9': { t: 5, by: 'B', d: { v: 1 } } })
    expect((await mergeRemote(base, [f])).size).toBe(1)
    expect((await mergeRemote(base, [f])).size).toBe(0)
  })
})
