import { describe, expect, it } from 'vitest'
import { defaultCriteria, mapPoint, newIdea, parseIdeas, ranking, rankingCsv, scoreOf, votedCount, weighted } from './ideasmath'

const crit = defaultCriteria()
let n = 0
const id = () => 'x' + ++n

describe('ideasmath', () => {
  it('weighted ignores unvoted criteria and zero weights', () => {
    const c = crit.map((x) => ({ ...x }))
    c.find((x) => x.id === 'imp')!.w = 3
    c.find((x) => x.id === 'sat')!.w = 0
    expect(weighted({ imp: 5, sat: 1, prf: 1 }, c)).toBeCloseTo((5 * 3 + 1) / 4)
    expect(weighted({}, c)).toBeNull()
    expect(weighted({ sat: 4 }, c)).toBeNull()
  })

  it('mapPoint needs both a value and an ease vote', () => {
    const i = newIdea('a', 'A', { scores: { imp: 4, prf: 2 } })
    expect(mapPoint(i, crit)).toBeNull()
    i.scores.fea = 5
    expect(mapPoint(i, crit)).toEqual({ x: 5, y: 3 })
  })

  it('ranking sorts by score and skips unvoted ideas', () => {
    const a = newIdea('a', 'A', { scores: { imp: 2 } })
    const b = newIdea('b', 'B', { scores: { imp: 5 } })
    const c = newIdea('c', 'C')
    const d = newIdea('d', 'D', { scores: { imp: 2 } })
    expect(ranking([a, b, c, d], crit).map((r) => r.idea.id)).toEqual(['b', 'a', 'd'])
    expect(scoreOf(c, crit)).toBeNull()
    expect(votedCount(b, crit)).toBe(1)
  })

  it('parseIdeas reads JSON and plain lines', () => {
    const j = parseIdeas('[{"title":"Idea 1","category":"Health","spunto":"why?"},{"description":"no title"}]', id)
    expect(j).toHaveLength(1)
    expect(j[0]).toMatchObject({ title: 'Idea 1', category: 'Health', prompt: 'why?', status: 'disc' })
    const l = parseIdeas('Plain idea\nTravel: Guided tours\n\n', id)
    expect(l.map((x) => [x.category, x.title])).toEqual([['New ideas', 'Plain idea'], ['Travel', 'Guided tours']])
    expect(parseIdeas('[not json', id)).toHaveLength(1)
    expect(parseIdeas('   ', id)).toEqual([])
  })

  it('rankingCsv quotes values', () => {
    const a = newIdea('a', 'Say "hi"', { scores: { imp: 4 }, note: 'x,y' })
    const csv = rankingCsv([a], crit).split('\n')
    expect(csv).toHaveLength(2)
    expect(csv[1]).toContain('"Say ""hi"""')
    expect(csv[1]).toContain('"4.0"')
    expect(csv[1]).toContain('"x,y"')
  })
})
