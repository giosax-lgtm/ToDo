// CALCOLI DEL TOOL "IDEAS" (lavagne di idee da votare): punteggio medio pesato, posizione nella mappa valore/facilita', classifica, import da testo/JSON ed esportazione CSV.
// Funzioni pure, senza stato: usate da Ideas.svelte e dallo store (criteri iniziali). Test in ideasmath.test.ts.

import type { IdeaCriterion, IdeaItem } from './types'

// Criteri iniziali di una nuova lavagna (modificabili dall'utente). Gruppo 'v' = valore (asse verticale), 'e' = facilita' (asse orizzontale).
export function defaultCriteria(): IdeaCriterion[] {
  const c = (id: string, name: string, hint: string, scale: string, group: 'v' | 'e'): IdeaCriterion => ({ id, name, hint, scale, group, w: 1 })
  return [
    c('imp', 'Impact', 'How much it improves people’s lives', '1 marginal · 5 transformative', 'v'),
    c('sat', 'Personal satisfaction', 'How excited we are to work on it', '1 little · 5 a lot', 'v'),
    c('prf', 'Profit potential', 'Market size and margins', '1 low · 5 high', 'v'),
    c('dif', 'Differentiation', 'How unique it is compared with the competition', '1 crowded · 5 free space', 'v'),
    c('fea', 'Technical feasibility', 'Can it be built with today’s technology?', '1 open research · 5 already feasible', 'e'),
    c('cap', 'Capital and time needed', 'How much to reach a first product', '1 a great deal · 5 very little', 'e'),
    c('reg', 'Regulatory constraints', 'Certifications, legal, privacy', '1 heavy · 5 light', 'e'),
    c('fit', 'Team fit', 'Skills and contacts we already have', '1 none · 5 excellent', 'e'),
  ]
}

// Idea vuota con i campi obbligatori.
export function newIdea(id: string, title: string, extra: Partial<IdeaItem> = {}): IdeaItem {
  return { id, title, description: '', category: 'New ideas', prompt: '', scores: {}, status: 'disc', note: '', ...extra }
}

// Media pesata dei voti sui criteri indicati (solo quelli votati con peso > 0). null se non c'e' nulla da mediare.
export function weighted(scores: Record<string, number>, criteria: IdeaCriterion[]): number | null {
  let n = 0
  let d = 0
  for (const c of criteria) {
    const v = scores[c.id]
    if (!v || !(c.w > 0)) continue
    n += v * c.w
    d += c.w
  }
  return d > 0 ? n / d : null
}

// Punteggio complessivo dell'idea (tutti i criteri).
export const scoreOf = (i: IdeaItem, criteria: IdeaCriterion[]) => weighted(i.scores, criteria)

// Quanti criteri sono stati votati per l'idea.
export const votedCount = (i: IdeaItem, criteria: IdeaCriterion[]) => criteria.filter((c) => i.scores[c.id]).length

// Posizione nella mappa: x = facilita' (media dei criteri 'e'), y = valore (media dei criteri 'v'). null se manca un asse.
export function mapPoint(i: IdeaItem, criteria: IdeaCriterion[]): { x: number; y: number } | null {
  const x = weighted(i.scores, criteria.filter((c) => c.group === 'e'))
  const y = weighted(i.scores, criteria.filter((c) => c.group === 'v'))
  return x == null || y == null ? null : { x, y }
}

// Classifica: le idee con almeno un voto, dal punteggio piu' alto; a pari punteggio resta l'ordine dell'elenco.
export function ranking(ideas: IdeaItem[], criteria: IdeaCriterion[]): { idea: IdeaItem; score: number }[] {
  return ideas
    .map((idea, k) => ({ idea, score: scoreOf(idea, criteria), k }))
    .filter((x): x is { idea: IdeaItem; score: number; k: number } => x.score != null)
    .sort((a, b) => b.score - a.score || a.k - b.k)
    .map(({ idea, score }) => ({ idea, score }))
}

// Importa idee da testo: un JSON (array di {title, description?, category?, spunto?/prompt?}) oppure una riga per idea ("Titolo" o "Categoria: Titolo").
export function parseIdeas(text: string, newId: () => string): IdeaItem[] {
  const t = text.trim()
  if (!t) return []
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t) as unknown
      if (Array.isArray(arr)) {
        const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
        return arr
          .map((o: Record<string, unknown>) => {
            const title = s(o?.title, 120)
            return title
              ? newIdea(newId(), title, { description: s(o.description, 600), category: s(o.category, 40) || 'New ideas', prompt: s(o.prompt ?? o.spunto, 240) })
              : null
          })
          .filter((x): x is IdeaItem => !!x)
      }
    } catch {
      /* non e' JSON valido: si tratta come testo a righe */
    }
  }
  return t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([^:]{1,40}):\s*(.+)$/.exec(l)
      return newIdea(newId(), (m ? m[2] : l).slice(0, 120), m ? { category: m[1].trim() } : {})
    })
}

const STATUS_LABEL: Record<IdeaItem['status'], string> = { disc: 'To discuss', appr: 'To explore', ok: 'Promoted', no: 'Dropped' }
export const statusLabel = (s: IdeaItem['status']) => STATUS_LABEL[s]

// CSV della classifica (separatore virgola, valori sempre tra virgolette). Colonne: posizione, idea, categoria, punteggio, un voto per criterio, stato, note.
export function rankingCsv(ideas: IdeaItem[], criteria: IdeaCriterion[]): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Rank', 'Idea', 'Category', 'Score', ...criteria.map((c) => c.name), 'Status', 'Notes']
  const lines = [head.map(q).join(',')]
  ranking(ideas, criteria).forEach(({ idea, score }, n) => {
    lines.push([n + 1, idea.title, idea.category, score.toFixed(1), ...criteria.map((c) => idea.scores[c.id] ?? ''), statusLabel(idea.status), idea.note].map(q).join(','))
  })
  return lines.join('\n')
}
