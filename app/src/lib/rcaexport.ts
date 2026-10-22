// ESPORTAZIONE DELLE ANALISI RCA: PNG, PDF e PowerPoint (.pptx) a partire dalla geometria di rcalayout.ts (la stessa che vede l'utente).
// - SVG: disegno vettoriale dell'analisi, base di PNG e PDF (rasterizzato su canvas; il PDF e' una pagina con l'immagine JPEG).
// - PPTX: una diapositiva con forme NATIVE (rettangoli con testo, linee a mano libera, croci), quindi modificabile in PowerPoint. Usa il mini zip di zip.ts.
// Le funzioni buildSvg/buildPptx/buildPdf sono pure (testate in rcaexport.test.ts); exportRca() usa il DOM per rasterizzare e scaricare.

import { COLORS } from './colors'
import { estimate, FONT, LINE_H, PAD_X, PAD_Y, wrap, type Box, type Layout, type Measure } from './rcalayout'
import { cellKey, ISNOT_COLS, ISNOT_ROWS, paretoRows } from './rcatables'
import type { Rca } from './types'
import { download, safeName } from './noteexport'
import { makeZip } from './zip'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MARGIN = 24
const TITLE_H = 36
const GREY_BG = '#e8e8e8'
const GREY_FG = '#6b6b6b'
const GREEN = '#2e9e4f'

// Colori effettivi di un box (fondo, testo, bordo, tratteggio): gli scartati diventano grigi.
function look(b: Box) {
  const c = COLORS[b.color ?? 'gray'] ?? COLORS.gray
  if (b.role === 'gate') return { bg: '#ffffff', fg: '#444444', line: '#6b7280', dash: false, w: 2 }
  if (b.out) return { bg: GREY_BG, fg: GREY_FG, line: '#b5b8be', dash: true, w: 1.5 }
  return { bg: c.bg, fg: c.fg, line: b.cause ? GREEN : '#555555', dash: false, w: b.cause ? 2.5 : 1 }
}
const lineLook = (l: Layout['lines'][number]) =>
  l.hot ? { c: GREEN, w: 3, dash: '' } : l.out ? { c: '#b5b8be', w: 1.4, dash: '6 5' } : { c: l.bold ? '#6b7280' : '#8a8f98', w: l.bold ? 2.6 : 1.6, dash: l.dashed ? '4 3' : '' }

// SVG completo con titolo in alto. Dimensioni in px (1 unita' = 1 px del layout).
export function buildSvg(layout: Layout, title: string): { svg: string; width: number; height: number } {
  const width = Math.max(layout.width + MARGIN * 2, 360)
  const height = layout.height + MARGIN * 2 + TITLE_H
  const ox = MARGIN, oy = MARGIN + TITLE_H
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Arial, sans-serif">`)
  out.push(`<rect width="100%" height="100%" fill="#ffffff"/>`)
  out.push(`<text x="${MARGIN}" y="${MARGIN + 14}" font-size="20" font-weight="700" fill="#1d1c1d">${esc(title)}</text>`)
  out.push(`<g transform="translate(${ox},${oy})">`)
  for (const l of layout.lines) {
    const s = lineLook(l)
    out.push(`<path d="${l.d}" fill="none" stroke="${s.c}" stroke-width="${s.w}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`)
    if (l.cross) out.push(`<text x="${l.cross.x}" y="${l.cross.y}" font-size="16" font-weight="700" fill="#c0392b" text-anchor="middle" dominant-baseline="central">✕</text>`)
  }
  for (const b of layout.boxes) {
    const k = look(b)
    if (b.label) out.push(`<text x="${b.x}" y="${b.y - 5}" font-size="11" font-weight="700" fill="#616061">${esc(b.label.toUpperCase())}</text>`)
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.role === 'gate' ? 12 : 8}" fill="${k.bg}" stroke="${k.line}" stroke-width="${k.w}"${k.dash ? ' stroke-dasharray="5 4"' : ''}/>`)
    const bold = b.role === 'root' || b.role === 'cat' || b.role === 'gate'
    const center = b.role === 'cat' || b.role === 'gate'
    b.lines.forEach((ln, i) => {
      const x = center ? b.x + b.w / 2 : b.x + PAD_X
      const y = b.y + PAD_Y + i * LINE_H + LINE_H / 2
      out.push(`<text x="${x}" y="${y}" font-size="${b.role === 'gate' ? 11 : FONT}"${bold ? ' font-weight="700"' : ''} fill="${k.fg}"${center ? ' text-anchor="middle"' : ''} dominant-baseline="central">${esc(ln)}</text>`)
    })
    if (b.cause) out.push(`<text x="${b.x + b.w}" y="${b.y}" font-size="18" fill="#e6a817" text-anchor="middle" dominant-baseline="central">★</text>`)
    if (b.out && b.role !== 'gate') out.push(`<circle cx="${b.x + b.w}" cy="${b.y}" r="9" fill="#c0392b"/><text x="${b.x + b.w}" y="${b.y}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">✕</text>`)
  }
  out.push('</g></svg>')
  return { svg: out.join(''), width, height }
}

// Tabella Is / Is-Not come SVG (righe alte quanto la cella piu' lunga).
export function buildIsNotSvg(rca: Rca, measure: Measure = estimate): { svg: string; width: number; height: number } {
  const QW = 210, CW = 250, HEAD = 46
  const width = MARGIN * 2 + QW + CW * 3
  const hdrBg = { is: '#cdeccb', not: '#f8d3d8', diff: '#f8e3a1' } as const
  const rows = ISNOT_ROWS.map((r, i) => {
    const cells = ISNOT_COLS.map((c) => wrap(rca.grid?.[cellKey(i, c.key)] ?? '', CW, measure))
    const q = wrap(r.q, QW, measure)
    const n = Math.max(2, q.length + 1, ...cells.map((c) => c.length))
    return { r, cells, q, h: n * LINE_H + PAD_Y * 2 }
  })
  const height = MARGIN * 2 + TITLE_H + HEAD + rows.reduce((s, r) => s + r.h, 0)
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Arial, sans-serif"><rect width="100%" height="100%" fill="#ffffff"/>`]
  out.push(`<text x="${MARGIN}" y="${MARGIN + 14}" font-size="20" font-weight="700" fill="#1d1c1d">${esc(rca.title)}</text>`)
  let y = MARGIN + TITLE_H
  ISNOT_COLS.forEach((c, j) => {
    const x = MARGIN + QW + j * CW
    out.push(`<rect x="${x}" y="${y}" width="${CW}" height="${HEAD}" fill="${hdrBg[c.key]}" stroke="#555" stroke-width="1"/><text x="${x + PAD_X}" y="${y + 17}" font-size="13" font-weight="700" fill="#333">${esc(c.title)}</text>`)
    wrap(c.sub, CW, measure).slice(0, 2).forEach((l, k) => out.push(`<text x="${x + PAD_X}" y="${y + 31 + k * 12}" font-size="10" fill="#555">${esc(l)}</text>`))
  })
  y += HEAD
  for (const row of rows) {
    out.push(`<rect x="${MARGIN}" y="${y}" width="${QW}" height="${row.h}" fill="#f2f2f2" stroke="#555" stroke-width="1"/><text x="${MARGIN + PAD_X}" y="${y + PAD_Y + LINE_H / 2}" font-size="${FONT}" font-weight="700" fill="#333" dominant-baseline="central">${row.r.dim}</text>`)
    row.q.forEach((l, k) => out.push(`<text x="${MARGIN + PAD_X}" y="${y + PAD_Y + LINE_H * (k + 1.5)}" font-size="11" fill="#555" dominant-baseline="central">${esc(l)}</text>`))
    row.cells.forEach((lines, j) => {
      const x = MARGIN + QW + j * CW
      out.push(`<rect x="${x}" y="${y}" width="${CW}" height="${row.h}" fill="#ffffff" stroke="#555" stroke-width="1"/>`)
      lines.forEach((l, k) => out.push(`<text x="${x + PAD_X}" y="${y + PAD_Y + LINE_H * (k + 0.5)}" font-size="${FONT}" fill="#222" dominant-baseline="central">${esc(l)}</text>`))
    })
    y += row.h
  }
  out.push('</svg>')
  return { svg: out.join(''), width, height }
}

// Grafico di Pareto come SVG (stessa geometria di RcaPareto.svelte, piu' il titolo).
export function buildParetoSvg(rca: Rca): { svg: string; width: number; height: number } {
  const W = 720, H = 300, L = 44, R = 44, T = 16, B = 70
  const rows = paretoRows(rca.items ?? [])
  const total = rows.reduce((s, r) => s + r.n, 0)
  const width = W + MARGIN * 2
  const height = H + MARGIN * 2 + TITLE_H + 24
  const bw = rows.length ? (W - L - R) / rows.length : 0
  const yBar = (v: number) => T + (H - T - B) * (1 - v / (rows[0]?.n || 1))
  const yPct = (p: number) => T + (H - T - B) * (1 - p / 100)
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Arial, sans-serif"><rect width="100%" height="100%" fill="#ffffff"/>`]
  out.push(`<text x="${MARGIN}" y="${MARGIN + 14}" font-size="20" font-weight="700" fill="#1d1c1d">${esc(rca.title)}</text>`)
  out.push(`<g transform="translate(${MARGIN},${MARGIN + TITLE_H})">`)
  for (const p of [0, 20, 40, 60, 80, 100]) out.push(`<line x1="${L}" x2="${W - R}" y1="${yPct(p)}" y2="${yPct(p)}" stroke="#e3e3e3"/><text x="${W - R + 6}" y="${yPct(p)}" font-size="10" fill="#777" dominant-baseline="central">${p}%</text>`)
  out.push(`<line x1="${L}" x2="${W - R}" y1="${yPct(80)}" y2="${yPct(80)}" stroke="#c0392b" stroke-dasharray="5 4"/>`)
  rows.forEach((r, i) => {
    const cx = L + i * bw + bw / 2
    out.push(`<rect x="${L + i * bw + bw * 0.12}" y="${yBar(r.n)}" width="${bw * 0.76}" height="${H - B - yBar(r.n)}" rx="3" fill="${r.vital ? '#4a90d9' : '#c9ccd1'}"/>`)
    out.push(`<text x="${cx}" y="${yBar(r.n) - 5}" font-size="11" font-weight="700" text-anchor="middle" fill="#333">${r.n}</text>`)
    out.push(`<text x="${cx}" y="${H - B + 14}" font-size="10" text-anchor="middle" fill="#333">${esc(r.text.length > 16 ? r.text.slice(0, 15) + '…' : r.text)}</text>`)
  })
  out.push(`<polyline fill="none" stroke="#c0392b" stroke-width="2" points="${rows.map((r, i) => `${L + i * bw + bw / 2},${yPct(r.cum)}`).join(' ')}"/>`)
  rows.forEach((r, i) => out.push(`<circle cx="${L + i * bw + bw / 2}" cy="${yPct(r.cum)}" r="3.5" fill="#c0392b"/>`))
  out.push(`<text x="${L - 6}" y="${T}" font-size="10" fill="#777" text-anchor="end" dominant-baseline="central">${rows[0]?.n ?? 0}</text><text x="${L - 6}" y="${H - B}" font-size="10" fill="#777" text-anchor="end" dominant-baseline="central">0</text>`)
  out.push(`</g><text x="${MARGIN}" y="${height - 14}" font-size="11" fill="#666">Total ${total} · blue = vital few (up to 80%)</text></svg>`)
  return { svg: out.join(''), width, height }
}

// ---- PDF: una pagina con l'immagine JPEG a tutta pagina (formato pagina = dimensioni del diagramma in punti) ----
export function buildPdf(jpeg: Uint8Array, wPx: number, hPx: number): Uint8Array {
  const enc = new TextEncoder()
  const W = Math.round(wPx * 0.75), H = Math.round(hPx * 0.75)
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let pos = 0
  const push = (d: Uint8Array | string) => {
    const b = typeof d === 'string' ? enc.encode(d) : d
    parts.push(b)
    pos += b.length
  }
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = pos
    push(`${n} 0 obj\n${body}`)
    if (stream) { push('\nstream\n'); push(stream); push('\nendstream') }
    push('\nendobj\n')
  }
  push('%PDF-1.4\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
  const content = enc.encode(`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`)
  obj(5, `<< /Length ${content.length} >>`, content)
  const xref = pos
  let tail = `xref\n0 6\n0000000000 65535 f \n`
  for (let n = 1; n <= 5; n++) tail += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  tail += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  push(tail)
  const all = new Uint8Array(pos)
  let o = 0
  for (const p of parts) { all.set(p, o); o += p.length }
  return all
}

// ---- PPTX ----
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const SLIDE_W = 12192000, SLIDE_H = 6858000 // 16:9
const hex = (c: string) => c.replace('#', '').toUpperCase()

// Scompone un percorso SVG (solo M, L, C come generati da rcalayout.ts) in comandi con coordinate numeriche.
export function parsePath(d: string): { op: 'M' | 'L' | 'C'; pts: number[] }[] {
  const cmds: { op: 'M' | 'L' | 'C'; pts: number[] }[] = []
  for (const m of d.matchAll(/([MLC])([^MLC]*)/g)) cmds.push({ op: m[1] as 'M' | 'L' | 'C', pts: (m[2].match(/-?\d+(\.\d+)?/g) ?? []).map(Number) })
  return cmds
}

export function buildPptx(layout: Layout, title: string): Uint8Array {
  const area = { x: 300000, y: 800000, w: SLIDE_W - 600000, h: SLIDE_H - 800000 - 300000 }
  // Quanti EMU vale 1 px del layout: il diagramma si adatta all'area della diapositiva (al massimo 1,6 volte la dimensione a 96 dpi, cioe' 9525 EMU per px).
  const scale = Math.min(area.w / Math.max(layout.width, 1), area.h / Math.max(layout.height, 1), 9525 * 1.6)
  const offX = area.x + (area.w - layout.width * scale) / 2
  const offY = area.y
  const E = (v: number) => Math.round(v * scale)
  const X = (v: number) => Math.round(offX + v * scale)
  const Y = (v: number) => Math.round(offY + v * scale)
  const fontSz = Math.max(600, Math.round(FONT * scale / 12700 * 100)) // centesimi di punto (1 pt = 12700 EMU)
  let id = 2
  const shapes: string[] = []

  const run = (text: string, sz: number, color: string, bold: boolean) =>
    `<a:r><a:rPr lang="en-US" sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill></a:rPr><a:t>${esc(text)}</a:t></a:r>`
  const sp = (name: string, x: number, y: number, w: number, h: number, geom: string, fill: string | null, ln: string | null, lnW: number, dash: boolean, body: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(w, 1)}" cy="${Math.max(h, 1)}"/></a:xfrm>${geom}` +
    (fill ? `<a:solidFill><a:srgbClr val="${hex(fill)}"/></a:solidFill>` : '<a:noFill/>') +
    (ln ? `<a:ln w="${Math.round(lnW * scale)}"><a:solidFill><a:srgbClr val="${hex(ln)}"/></a:solidFill>${dash ? '<a:prstDash val="dash"/>' : ''}</a:ln>` : '<a:ln><a:noFill/></a:ln>') +
    `</p:spPr>${body}</p:sp>`
  const prst = (g: string) => `<a:prstGeom prst="${g}"><a:avLst/></a:prstGeom>`
  const tx = (paras: string, anchor: 'ctr' | 't', inset: number) =>
    `<p:txBody><a:bodyPr wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" anchor="${anchor}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody>`
  const para = (runs: string, algn: 'l' | 'ctr') => `<a:p><a:pPr algn="${algn}"/>${runs}</a:p>`

  // Titolo
  shapes.push(sp('Title', 300000, 200000, SLIDE_W - 600000, 500000, prst('rect'), null, null, 0, false, tx(para(run(title, 2400, '#1d1c1d', true), 'l'), 'ctr', 0)))

  // Linee come forme a mano libera (modificabili punto per punto in PowerPoint).
  for (const l of layout.lines) {
    const cmds = parsePath(l.d)
    const xs = cmds.flatMap((c) => c.pts.filter((_, i) => i % 2 === 0))
    const ys = cmds.flatMap((c) => c.pts.filter((_, i) => i % 2 === 1))
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const w = E(Math.max(...xs) - minX), h = E(Math.max(...ys) - minY)
    const P = (x: number, y: number) => `<a:pt x="${E(x - minX)}" y="${E(y - minY)}"/>`
    const path = cmds
      .map((c) => {
        const p = c.pts
        if (c.op === 'M') return `<a:moveTo>${P(p[0], p[1])}</a:moveTo>`
        if (c.op === 'L') return `<a:lnTo>${P(p[0], p[1])}</a:lnTo>`
        return `<a:cubicBezTo>${P(p[0], p[1])}${P(p[2], p[3])}${P(p[4], p[5])}</a:cubicBezTo>`
      })
      .join('')
    const geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.max(w, 1)}" h="${Math.max(h, 1)}" fill="none">${path}</a:path></a:pathLst></a:custGeom>`
    const s = lineLook(l)
    shapes.push(sp('Link', X(minX), Y(minY), w, h, geom, null, s.c, s.w, !!s.dash, ''))
    if (l.cross) shapes.push(sp('Ruled out', X(l.cross.x) - E(10), Y(l.cross.y) - E(10), E(20), E(20), prst('rect'), null, null, 0, false, tx(para(run('✕', Math.max(800, fontSz + 300), '#c0392b', true), 'ctr'), 'ctr', 0)))
  }

  for (const b of layout.boxes) {
    const kk = look(b)
    if (b.label) shapes.push(sp('Label', X(b.x), Y(b.y) - E(16), E(b.w), E(14), prst('rect'), null, null, 0, false, tx(para(run(b.label.toUpperCase(), Math.max(500, fontSz - 200), '#616061', true), 'l'), 'ctr', 0)))
    const bold = b.role !== 'node'
    const center = b.role === 'cat' || b.role === 'gate'
    const text = b.role === 'gate' ? b.lines[0] : b.lines.join(' ')
    shapes.push(
      sp(b.role === 'gate' ? `Gate ${text}` : 'Node', X(b.x), Y(b.y), E(b.w), E(b.h), prst('roundRect'), kk.bg, kk.line, kk.w, kk.dash,
        tx(para(run(text, b.role === 'gate' ? Math.max(500, fontSz - 100) : fontSz, kk.fg, bold), center ? 'ctr' : 'l'), 'ctr', E(PAD_X * 0.7))),
    )
    if (b.cause) shapes.push(sp('Root cause', X(b.x + b.w) - E(11), Y(b.y) - E(11), E(22), E(22), prst('rect'), null, null, 0, false, tx(para(run('★', fontSz + 400, '#e6a817', true), 'ctr'), 'ctr', 0)))
    if (b.out && b.role !== 'gate') shapes.push(sp('Ruled out', X(b.x + b.w) - E(9), Y(b.y) - E(9), E(18), E(18), prst('ellipse'), '#c0392b', null, 0, false, tx(para(run('✕', Math.max(500, fontSz - 100), '#ffffff', true), 'ctr'), 'ctr', 0)))
  }

  const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const rels = (items: [string, string, string][]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([i, t, g]) => `<Relationship Id="${i}" Type="${R}/${t}" Target="${g}"/>`).join('')}</Relationships>`
  const emptyTree = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>'
  const clr = (n: string, v: string) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`
  const fills = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  const lnS = '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="RCA"><a:themeElements><a:clrScheme name="RCA"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${clr('dk2', '44546A')}${clr('lt2', 'E7E6E6')}${clr('accent1', '4472C4')}${clr('accent2', 'ED7D31')}${clr('accent3', 'A5A5A5')}${clr('accent4', 'FFC000')}${clr('accent5', '5B9BD5')}${clr('accent6', '70AD47')}${clr('hlink', '0563C1')}${clr('folHlink', '954F72')}</a:clrScheme><a:fontScheme name="RCA"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="RCA"><a:fillStyleLst>${fills}${fills}${fills}</a:fillStyleLst><a:lnStyleLst>${lnS}${lnS}${lnS}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${fills}${fills}${fills}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`
  const master = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS}>${emptyTree}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`
  const layoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS} type="blank">${emptyTree.replace('<p:cSld>', '<p:cSld name="Blank">')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  const pres = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
  const ct = (part: string, type: string) => `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${ct('/ppt/presentation.xml', 'presentationml.presentation.main')}${ct('/ppt/slides/slide1.xml', 'presentationml.slide')}${ct('/ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout')}${ct('/ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster')}${ct('/ppt/theme/theme1.xml', 'theme')}</Types>`
  return makeZip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
    { name: 'ppt/presentation.xml', data: pres },
    { name: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'slide', 'slides/slide1.xml']]) },
    { name: 'ppt/slides/slide1.xml', data: slide },
    { name: 'ppt/slides/_rels/slide1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layoutXml },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: master },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
    { name: 'ppt/theme/theme1.xml', data: theme },
  ])
}

// ---- Entry point (browser) ----
export type RcaFormat = 'png' | 'pdf' | 'pptx'

// Rasterizza l'SVG su canvas (scala 2 per la nitidezza) e lo restituisce come Blob nel tipo richiesto.
async function raster(svg: string, w: number, h: number, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const c = document.createElement('canvas')
  c.width = w * 2
  c.height = h * 2
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), type, 0.92))
}

// Esporta l'analisi nel formato scelto e avvia il download.
export async function exportRca(fmt: RcaFormat, rca: Rca, layout: Layout, measure?: Measure) {
  const title = rca.title
  const name = safeName(title) || 'analysis'
  if (fmt === 'pptx') {
    const bytes = buildPptx(layout, title)
    download(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), `${name}.pptx`)
    return
  }
  const { svg, width, height } = rca.kind === 'isnot' ? buildIsNotSvg(rca, measure) : rca.kind === 'pareto' ? buildParetoSvg(rca) : buildSvg(layout, title)
  if (fmt === 'png') return download(await raster(svg, width, height, 'image/png'), `${name}.png`)
  const jpg = new Uint8Array(await (await raster(svg, width, height, 'image/jpeg')).arrayBuffer())
  download(new Blob([buildPdf(jpg, width * 2, height * 2) as BlobPart], { type: 'application/pdf' }), `${name}.pdf`)
}
