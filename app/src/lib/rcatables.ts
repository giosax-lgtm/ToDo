// DATI E CALCOLI DEGLI STRUMENTI NON AD ALBERO: tabella "E' / Non e'" (Is / Is-Not) e grafico di Pareto.
// Usato da RcaIsNot.svelte, RcaPareto.svelte e rcaexport.ts (stessi numeri a schermo e nell'esportazione).

import type { RcaItem } from './types'

export const ISNOT_COLS = [
  { key: 'is', title: 'IS', sub: 'What the problem is, where, when, how much' },
  { key: 'not', title: 'IS NOT', sub: 'What it could be but is not (the comparison)' },
  { key: 'diff', title: 'DISTINCTIVE / WHAT CHANGED?', sub: 'What is different between IS and IS NOT? Any change?' },
] as const

export const ISNOT_ROWS = [
  { dim: 'WHAT', q: 'Which object or thing has the problem?' },
  { dim: 'WHAT', q: 'Which defect or problem exactly?' },
  { dim: 'WHERE', q: 'Where is it seen (place, step of the process)?' },
  { dim: 'WHERE', q: 'Where on the object?' },
  { dim: 'WHEN', q: 'When was it first seen?' },
  { dim: 'WHEN', q: 'When does it happen (pattern, cycle)?' },
  { dim: 'EXTENT', q: 'How many, how much?' },
  { dim: 'EXTENT', q: 'Trend: getting worse, stable, better?' },
] as const

export const cellKey = (row: number, col: string) => `r${row}.${col}`

export interface ParetoRow extends RcaItem {
  cum: number // percentuale cumulata (0-100) fino a questa riga compresa
  vital: boolean // rientra nelle cause che spiegano l'80% del totale
}

// Righe con conteggio > 0 ordinate dalla piu' frequente, con percentuale cumulata. "Vital few" = le righe necessarie per arrivare all'80% (inclusa quella che lo supera).
export function paretoRows(items: RcaItem[]): ParetoRow[] {
  const rows = items.filter((i) => i.n > 0).sort((a, b) => b.n - a.n)
  const total = rows.reduce((s, r) => s + r.n, 0)
  let acc = 0
  let reached = false
  return rows.map((r) => {
    const vital = !reached
    acc += r.n
    if (acc / total >= 0.8) reached = true
    return { ...r, cum: total ? (acc / total) * 100 : 0, vital }
  })
}
