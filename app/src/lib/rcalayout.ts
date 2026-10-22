// LAYOUT DELLE ANALISI RCA: funzioni pure che trasformano i nodi di un'analisi (RcaNode) in rettangoli e linee gia' posizionati.
// Usato da Rca.svelte per disegnare (HTML + SVG) e, in futuro, dagli export PNG/PDF/PPTX, cosi' schermo ed esportazione mostrano la stessa geometria.
// Il testo viene mandato a capo con una funzione di misura iniettata (canvas nel browser, stima nei test).

import type { Rca, RcaNode } from './types'

export const FONT = 13 // px, come .rca-box nel CSS
export const LINE_H = 17
export const PAD_X = 10
export const PAD_Y = 8

export interface Box {
  id: string
  x: number
  y: number
  w: number
  h: number
  lines: string[]
  color?: string
  cause?: boolean
  role: 'root' | 'cat' | 'node' | 'gate'
  depth: number
  label?: string // etichetta sopra il box ("Problem", "Why 2")
  out?: boolean // il nodo o un suo antenato e' scartato
  hot?: boolean // sta sul percorso che porta a una causa radice
}
export interface Line {
  d: string // percorso SVG
  dashed?: boolean
  bold?: boolean
  out?: boolean // tratto verso un ramo scartato (grigio tratteggiato)
  hot?: boolean // tratto sul percorso verso una causa radice (evidenziato)
  cross?: { x: number; y: number } // segno ✕ che interrompe la strada (sul primo nodo scartato)
}
export interface Layout {
  boxes: Box[]
  lines: Line[]
  width: number
  height: number
}
export type Measure = (text: string) => number // larghezza in px del testo con il font del box

// Stima grezza (nei test e se il canvas non c'e'): larghezza media di un carattere.
export const estimate: Measure = (t) => t.length * FONT * 0.55

// Manda a capo 'text' in righe di al massimo 'width' px (spezza le parole troppo lunghe). Sempre almeno una riga.
export function wrap(text: string, width: number, measure: Measure = estimate): string[] {
  const max = Math.max(20, width - PAD_X * 2)
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (measure(word) > max && word.length > 1) {
        let k = word.length - 1
        while (k > 1 && measure(word.slice(0, k)) > max) k--
        if (line) { out.push(line); line = '' }
        out.push(word.slice(0, k))
        word = word.slice(k)
      }
      const next = line ? line + ' ' + word : word
      if (line && measure(next) > max) { out.push(line); line = word } else line = next
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

// Stato di ogni nodo: 'out' = scartato lui o un antenato; 'hot' = antenato (o se stesso) di una causa radice non scartata.
function flags(nodes: RcaNode[]) {
  const by = new Map(nodes.map((n) => [n.id, n]))
  const out = new Set<string>()
  const hot = new Set<string>()
  const isOut = (n: RcaNode): boolean => (n.out ? true : n.parentId ? isOut(by.get(n.parentId)!) : false)
  for (const n of nodes) {
    if (isOut(n)) out.add(n.id)
    else if (n.cause) for (let c: RcaNode | undefined = n; c; c = c.parentId ? by.get(c.parentId) : undefined) hot.add(c.id)
  }
  const first = (id: string) => !!by.get(id)?.out // primo nodo scartato del ramo: li' si disegna la ✕
  return { out: (id: string) => out.has(id), hot: (id: string) => hot.has(id), first }
}

const boxH = (lines: string[]) => lines.length * LINE_H + PAD_Y * 2
const kids = (nodes: RcaNode[], id: string | null) => nodes.filter((n) => n.parentId === id)

// Sequenza dei discendenti in ordine di lettura (profondita' prima), con la profondita' relativa a 'id' (figli diretti = 1).
function flatten(nodes: RcaNode[], id: string, depth = 1): { n: RcaNode; depth: number }[] {
  return kids(nodes, id).flatMap((n) => [{ n, depth }, ...flatten(nodes, n.id, depth + 1)])
}

// Albero orizzontale (5 Perche'): la radice (problema) a sinistra, un livello di "perche'" per colonna, il padre centrato sui figli.
function layoutWhys(rca: Rca, measure: Measure): Layout {
  const f = flags(rca.nodes)
  const W = 200, GX = 56, GY = 14
  const boxes: Box[] = []
  const lines: Line[] = []
  const root = rca.nodes.find((n) => n.parentId === null)
  if (!root) return { boxes, lines, width: 0, height: 0 }
  const lab = (d: number) => (d === 0 ? 'Problem' : `Why ${d}`)
  // Ritorna l'altezza occupata dal sottoalbero; y0 = bordo alto.
  const place = (n: RcaNode, depth: number, y0: number): number => {
    const lns = wrap(n.text, W, measure)
    const h = boxH(lns)
    const ch = kids(rca.nodes, n.id)
    let used = 0
    const centers: number[] = []
    for (const c of ch) {
      const hh = place(c, depth + 1, y0 + used)
      const b = boxes.find((x) => x.id === c.id)!
      centers.push(b.y + b.h / 2)
      used += hh + GY
    }
    used = ch.length ? used - GY : 0
    const total = Math.max(h, used)
    const cy = ch.length ? (centers[0] + centers[centers.length - 1]) / 2 : y0 + total / 2
    boxes.push({ id: n.id, x: depth * (W + GX), y: cy - h / 2, w: W, h, lines: lns, color: n.color, cause: n.cause, role: depth === 0 ? 'root' : 'node', depth, label: lab(depth), out: f.out(n.id), hot: f.hot(n.id) })
    for (const c of ch) {
      const cb = boxes.find((x) => x.id === c.id)!
      const x1 = depth * (W + GX) + W, y1 = cy, x2 = cb.x, y2 = cb.y + cb.h / 2
      lines.push({ d: `M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2},${y2}`, out: f.out(c.id), hot: f.hot(c.id), ...(f.first(c.id) ? { cross: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } } : {}) })
    }
    return total
  }
  const height = place(root, 0, 16) + 32
  const width = Math.max(...boxes.map((b) => b.x + b.w)) + 16
  return { boxes, lines, width, height }
}

// Lisca di pesce: la spina orizzontale porta all'effetto (testa a destra); le categorie (figli della radice) stanno sopra e sotto in alternanza,
// ognuna con la sua "lisca" obliqua; le cause (e sotto-cause, rientrate) sono rettangoli agganciati alla lisca da un tratto orizzontale.
function layoutFishbone(rca: Rca, measure: Measure): Layout {
  const root = rca.nodes.find((n) => n.parentId === null)
  const boxes: Box[] = []
  const lines: Line[] = []
  if (!root) return { boxes, lines, width: 0, height: 0 }
  const f = flags(rca.nodes)
  const CAT_W = 140, CAUSE_W = 170, DX = 70, GAP = 8, HEAD_W = 180, PAD = 16, HOOK = 12, INDENT = 16
  const cats = kids(rca.nodes, root.id).map((c, i) => {
    const lns = wrap(c.text, CAT_W, measure)
    const rows = flatten(rca.nodes, c.id).map(({ n, depth }) => {
      const w = Math.max(100, CAUSE_W - (depth - 1) * 10)
      const l = wrap(n.text, w, measure)
      return { n, depth, w, lines: l, h: boxH(l) }
    })
    const rowsH = rows.reduce((s, r) => s + r.h + GAP, 0)
    const H = Math.max(80, rowsH + 24)
    const catH = boxH(lns)
    const left = Math.max(DX + HOOK + Math.max(0, ...rows.map((r) => r.w + (r.depth - 1) * INDENT)), DX + CAT_W / 2)
    return { c, lns, rows, H, catH, left, top: i % 2 === 0 }
  })
  const topExt = Math.max(0, ...cats.filter((k) => k.top).map((k) => k.H + k.catH))
  const botExt = Math.max(0, ...cats.filter((k) => !k.top).map((k) => k.H + k.catH))
  const spineY = PAD + Math.max(topExt, 40) + 10
  let cursor = PAD
  for (let i = 0; i < cats.length; i += 2) {
    const pair = cats.slice(i, i + 2)
    const xs = cursor + Math.max(...pair.map((k) => k.left))
    for (const k of pair) {
      const sign = k.top ? -1 : 1
      const far = spineY + sign * k.H // dove la lisca incontra la categoria
      boxes.push({
        id: k.c.id, x: xs - DX - CAT_W / 2, y: k.top ? far - k.catH : far, w: CAT_W, h: k.catH, lines: k.lns, color: k.c.color, cause: k.c.cause, role: 'cat', depth: 1, out: f.out(k.c.id), hot: f.hot(k.c.id),
      })
      lines.push({ d: `M${xs - DX},${far} L${xs},${spineY}`, bold: true, out: f.out(k.c.id), hot: f.hot(k.c.id), ...(f.first(k.c.id) ? { cross: { x: xs - DX / 2, y: (far + spineY) / 2 } } : {}) })
      let y = k.top ? far + 12 : spineY + 12
      for (const r of k.rows) {
        const cy = y + r.h / 2
        const bx = xs - DX * (Math.abs(cy - spineY) / k.H)
        const right = bx - HOOK - (r.depth - 1) * INDENT
        boxes.push({ id: r.n.id, x: right - r.w, y, w: r.w, h: r.h, lines: r.lines, color: r.n.color, cause: r.n.cause, role: 'node', depth: r.depth + 1, out: f.out(r.n.id), hot: f.hot(r.n.id) })
        lines.push({ d: `M${right},${cy} L${bx},${cy}`, dashed: r.depth > 1, out: f.out(r.n.id), hot: f.hot(r.n.id), ...(f.first(r.n.id) ? { cross: { x: (right + bx) / 2, y: cy } } : {}) })
        y += r.h + GAP
      }
    }
    cursor = xs + 24
  }
  const lns = wrap(root.text, HEAD_W, measure)
  const hh = boxH(lns)
  const headX = cursor + 20
  lines.unshift({ d: `M${PAD},${spineY} L${headX},${spineY}`, bold: true })
  boxes.push({ id: root.id, x: headX, y: spineY - hh / 2, w: HEAD_W, h: hh, lines: lns, color: root.color, cause: root.cause, role: 'root', depth: 0, label: 'Effect' })
  return { boxes, lines, width: headX + HEAD_W + PAD, height: spineY + Math.max(botExt, 40) + PAD }
}

// Albero dei guasti (fault tree): evento di vertice in alto, sotto ogni evento una porta AND/OR (box 'gate', id "gate:<nodo>") che unisce le cause figlie.
// Le foglie sono eventi di base. Il padre e' centrato sui figli; ogni livello ha l'altezza del suo box piu' alto.
function layoutFaultTree(rca: Rca, measure: Measure): Layout {
  const boxes: Box[] = []
  const lines: Line[] = []
  const root = rca.nodes.find((n) => n.parentId === null)
  if (!root) return { boxes, lines, width: 0, height: 0 }
  const f = flags(rca.nodes)
  const W = 160, GX = 22, GATE_W = 46, GATE_H = 28, GAP = 20, PAD = 16
  const wrapped = new Map(rca.nodes.map((n) => [n.id, wrap(n.text, W, measure)]))
  // Altezza massima per livello.
  const levelH: number[] = []
  const scan = (n: RcaNode, d: number) => {
    levelH[d] = Math.max(levelH[d] ?? 0, boxH(wrapped.get(n.id)!))
    kids(rca.nodes, n.id).forEach((c) => scan(c, d + 1))
  }
  scan(root, 0)
  const levelY: number[] = []
  levelH.reduce((y, h, d) => ((levelY[d] = y), y + h + GAP * 2 + GATE_H), PAD + 14)
  // Larghezza del sottoalbero e posizionamento; x0 = bordo sinistro. Ritorna il centro del box.
  const width = (n: RcaNode): number => {
    const ch = kids(rca.nodes, n.id)
    return Math.max(W, ch.reduce((s, c) => s + width(c), 0) + Math.max(0, ch.length - 1) * GX)
  }
  const place = (n: RcaNode, d: number, x0: number): number => {
    const ch = kids(rca.nodes, n.id)
    const tw = width(n)
    const centers: number[] = []
    let x = x0
    for (const c of ch) {
      const cw = width(c)
      centers.push(place(c, d + 1, x))
      x += cw + GX
    }
    const cx = ch.length ? (centers[0] + centers[centers.length - 1]) / 2 : x0 + tw / 2
    const lns = wrapped.get(n.id)!
    const h = boxH(lns)
    const y = levelY[d]
    boxes.push({ id: n.id, x: cx - W / 2, y, w: W, h, lines: lns, color: n.color, cause: n.cause, role: d === 0 ? 'root' : 'node', depth: d, label: d === 0 ? 'Top event' : undefined, out: f.out(n.id), hot: f.hot(n.id) })
    if (ch.length) {
      const gy = y + levelH[d] + GAP
      const g = n.gate === 'and' ? 'AND' : 'OR'
      boxes.push({ id: `gate:${n.id}`, x: cx - GATE_W / 2, y: gy, w: GATE_W, h: GATE_H, lines: [g], role: 'gate', depth: d, out: f.out(n.id), hot: false })
      lines.push({ d: `M${cx},${y + h} L${cx},${gy}`, out: f.out(n.id) })
      const midY = gy + GATE_H + GAP / 2
      ch.forEach((c, i) => {
        const cy = levelY[d + 1]
        lines.push({
          d: `M${cx},${gy + GATE_H} L${cx},${midY} L${centers[i]},${midY} L${centers[i]},${cy}`,
          out: f.out(c.id),
          hot: f.hot(c.id),
          ...(f.first(c.id) ? { cross: { x: centers[i], y: midY + (cy - midY) / 2 } } : {}),
        })
      })
    }
    return cx
  }
  place(root, 0, PAD)
  const w = Math.max(...boxes.map((b) => b.x + b.w)) + PAD
  const h = Math.max(...boxes.map((b) => b.y + b.h)) + PAD
  return { boxes, lines, width: w, height: h }
}

// Entry point: geometria completa dell'analisi.
export function layoutRca(rca: Rca, measure: Measure = estimate): Layout {
  if (rca.kind === 'faulttree') return layoutFaultTree(rca, measure)
  return rca.kind === 'fishbone' ? layoutFishbone(rca, measure) : layoutWhys(rca, measure)
}

// Id del nodo e di tutti i suoi discendenti (per eliminazione e controllo dei cicli nello spostamento).
export function subtreeIds(nodes: RcaNode[], id: string): string[] {
  return [id, ...kids(nodes, id).flatMap((c) => subtreeIds(nodes, c.id))]
}
