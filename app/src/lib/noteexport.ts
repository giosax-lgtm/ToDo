// ESPORTAZIONE DELLE NOTE in vari formati: HTML, Markdown, testo semplice, Word (.docx) e PDF (finestra di stampa del browser).
// Parte sempre da una lista di pagine { title, html } (una pagina, una sezione o tutta la lista): l'HTML viene riletto con sanitizedRoot() (lib/notehtml.ts)
// e convertito camminando sul DOM. Il .docx e' costruito a mano (XML WordprocessingML) e impacchettato con lib/zip.ts. Nessuna libreria esterna.
// Usato da Notes.svelte (menu Export). Funziona solo nel browser (usa DOM, Blob, iframe).

import { escapeHtml, sanitizedRoot } from './notehtml'
import { makeZip } from './zip'

// Una pagina da esportare: titolo e contenuto HTML (gia' sanitizzato o da sanitizzare).
export interface ExportPage { title: string; html: string }

// Nome file sicuro ricavato da un titolo (niente caratteri vietati su Windows).
export function safeName(title: string): string {
  return (title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() || 'Notes').slice(0, 80)
}

// Avvia il download di un file nel browser. Usata da Notes.svelte per tutti i formati tranne il PDF.
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'hr', 'tr'])
const isBlock = (n: Node) => n.nodeType === 1 && BLOCKS.has((n as Element).tagName.toLowerCase())
const tagOf = (n: Node) => (n as Element).tagName.toLowerCase()

// ============================ HTML ============================

// Stile comune dei documenti HTML esportati e della stampa PDF.
const DOC_CSS = `
  body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1d1c1d; max-width: 780px; margin: 2rem auto; padding: 0 1rem; }
  h1.page-title { font-size: 22pt; margin: 0 0 .6em; }
  section.page + section.page { page-break-before: always; margin-top: 3rem; }
  blockquote { margin: .6em 0; padding-left: 1em; border-left: 3px solid #bbb; color: #444; }
  pre, code { font-family: Consolas, monospace; background: #f3f3f3; }
  pre { padding: .6em; white-space: pre-wrap; }
  table { border-collapse: collapse; } td, th { border: 1px solid #999; padding: 4px 8px; vertical-align: top; }
  a { color: #0563c1; }
  @media print { body { margin: 0; max-width: none; } }
`

// Documento HTML completo (con titolo e stile) da un elenco di pagine. Usato per l'export .html e per la stampa/PDF.
export function toHtmlDoc(title: string, pages: ExportPage[]): string {
  const body = pages
    .map((p) => `<section class="page"><h1 class="page-title">${escapeHtml(p.title || 'Untitled')}</h1>${sanitizedRoot(p.html).innerHTML}</section>`)
    .join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${DOC_CSS}</style></head><body>${body}</body></html>`
}

// Apre la finestra di stampa del browser sul documento (da li' si sceglie "Salva come PDF"). Usa un iframe nascosto e lo rimuove a stampa finita.
export function printPdf(title: string, pages: ExportPage[]) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  frame.srcdoc = toHtmlDoc(title, pages)
  frame.onload = () => {
    const w = frame.contentWindow
    if (!w) return
    w.document.title = title
    w.focus()
    w.print()
    setTimeout(() => frame.remove(), 60000)
  }
  document.body.appendChild(frame)
}

// ============================ Markdown / testo ============================

// Testo di un nodo "inline" (testo, grassetto, link...). In modalita' 'plain' niente simboli Markdown e i link diventano "testo (url)".
function inline(n: Node, plain: boolean): string {
  if (n.nodeType === 3) return (n.textContent ?? '').replace(/\s+/g, ' ')
  if (n.nodeType !== 1) return ''
  const el = n as HTMLElement
  const tag = tagOf(el)
  if (tag === 'br') return '\n'
  if (tag === 'img') return plain ? '[image]' : `![image](${el.getAttribute('src') ?? ''})`
  const inner = Array.from(el.childNodes).map((c) => inline(c, plain)).join('')
  const href = el.getAttribute('href')
  if (plain) return tag === 'a' && href && inner.trim() !== href ? `${inner} (${href})` : inner
  if (!inner.trim()) return inner
  const st = el.style
  const bold = tag === 'b' || tag === 'strong' || /^(bold|[6-9]00)$/.test(st.fontWeight)
  const ital = tag === 'i' || tag === 'em' || st.fontStyle === 'italic'
  const strike = tag === 's' || /line-through/.test(st.textDecorationLine || st.textDecoration)
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!
  let core = m[2]
  if (tag === 'code') core = '`' + core + '`'
  if (strike) core = `~~${core}~~`
  if (ital) core = `*${core}*`
  if (bold) core = `**${core}**`
  if (tag === 'a' && href) core = `[${core}](${href})`
  return m[1] + core + m[3]
}

// Elenco puntato/numerato (anche annidato) come righe di testo con rientro.
function listText(el: HTMLElement, plain: boolean, depth: number): string {
  const ordered = tagOf(el) === 'ol'
  let i = 1
  const lines: string[] = []
  for (const li of Array.from(el.children)) {
    if (tagOf(li) !== 'li') continue
    let buf = ''
    const nested: string[] = []
    for (const c of Array.from(li.childNodes)) {
      if (c.nodeType === 1 && (tagOf(c) === 'ul' || tagOf(c) === 'ol')) nested.push(listText(c as HTMLElement, plain, depth + 1))
      else if (isBlock(c)) buf += ' ' + walk(c, plain).join(' ')
      else buf += inline(c, plain)
    }
    lines.push('  '.repeat(depth) + (ordered ? `${i++}. ` : '- ') + buf.replace(/\s*\n\s*/g, ' ').trim())
    lines.push(...nested)
  }
  return lines.join('\n')
}

// Tabella come righe: Markdown (con riga di intestazione) o testo separato da tabulazioni.
function tableText(el: HTMLElement, plain: boolean): string {
  const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.children)
      .filter((c) => /^(td|th)$/.test(tagOf(c)))
      .map((c) => inline(c, plain).replace(/\s*\n\s*/g, ' ').replace(/\|/g, plain ? '|' : '\\|').trim()),
  )
  if (!rows.length) return ''
  if (plain) return rows.map((r) => r.join('\t')).join('\n')
  const cols = Math.max(...rows.map((r) => r.length))
  const pad = (r: string[]) => '| ' + Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ') + ' |'
  return [pad(rows[0]), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(pad)].join('\n')
}

// Converte i figli di un nodo in una lista di "blocchi" di testo (paragrafi, titoli, liste...), da unire con una riga vuota.
function walk(parent: Node, plain: boolean): string[] {
  const out: string[] = []
  let buf = ''
  const flush = () => {
    const t = buf.replace(/[ \t]*\n[ \t]*/g, '\n').trim()
    if (t) out.push(t)
    buf = ''
  }
  for (const n of Array.from(parent.childNodes)) {
    if (!isBlock(n)) { buf += inline(n, plain); continue }
    flush()
    const el = n as HTMLElement
    const tag = tagOf(el)
    if (tag === 'hr') out.push(plain ? '----------' : '---')
    else if (/^h[1-4]$/.test(tag)) {
      const t = Array.from(el.childNodes).map((c) => inline(c, plain)).join('').replace(/\s+/g, ' ').trim()
      if (t) out.push(plain ? t : '#'.repeat(Math.min(Number(tag[1]), 3)) + ' ' + t)
    } else if (tag === 'ul' || tag === 'ol') out.push(listText(el, plain, 0))
    else if (tag === 'blockquote') out.push(walk(el, plain).join('\n\n').split('\n').map((l) => (plain ? '    ' : '> ') + l).join('\n'))
    else if (tag === 'pre') out.push(plain ? (el.textContent ?? '') : '```\n' + (el.textContent ?? '').replace(/\n$/, '') + '\n```')
    else if (tag === 'table') out.push(tableText(el, plain))
    else out.push(...walk(el, plain))
  }
  flush()
  return out
}

// Esporta le pagine come Markdown (un titolo '#' per pagina, il contenuto dei titoli interni scende di livello).
export function toMarkdown(pages: ExportPage[]): string {
  return pages
    .map((p) => {
      const body = walk(sanitizedRoot(p.html), false)
        .map((b) => b.replace(/^(#{1,3}) /, '#$1 '))
        .join('\n\n')
      return `# ${p.title || 'Untitled'}\n\n${body}`.trim()
    })
    .join('\n\n---\n\n') + '\n'
}

// Esporta le pagine come testo semplice (titolo sottolineato, liste con trattino, nessuna formattazione).
export function toText(pages: ExportPage[]): string {
  return pages
    .map((p) => {
      const title = p.title || 'Untitled'
      return `${title}\n${'='.repeat(title.length)}\n\n${walk(sanitizedRoot(p.html), true).join('\n\n')}`.trim()
    })
    .join('\n\n\n') + '\n'
}

// ============================ Word (.docx) ============================

// Formattazione ereditata scendendo nei tag inline (grassetto, colore, font...).
interface Fmt { b?: boolean; i?: boolean; u?: boolean; s?: boolean; color?: string; bg?: string; font?: string; sz?: number; href?: string; va?: 'superscript' | 'subscript' }
// Opzioni di un paragrafo: stile, lista, rientro in twip, allineamento, citazione, riquadro grigio (codice), riga orizzontale, interruzione di pagina prima.
interface Para { style?: string; num?: { id: number; lvl: number }; ind?: number; jc?: string; quote?: boolean; shade?: boolean; rule?: boolean; pageBreak?: boolean }
// Immagine da inserire nel .docx: id della relazione, nome del file in word/media e byte.
interface Img { rid: string; name: string; ext: string; bytes: Uint8Array }
// Stato condiviso durante la costruzione: link trovati, liste numerate create e immagini incontrate.
interface Ctx { links: string[]; ordered: number[]; images: Img[] }

// Escape dei caratteri speciali XML.
const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Colore CSS (#rgb, #rrggbb, rgb()) -> 'RRGGBB' per Word; undefined se non riconosciuto o trasparente.
function hex(c: string): string | undefined {
  c = c.trim().toLowerCase()
  let m = c.match(/^#([0-9a-f]{6})$/)
  if (m) return m[1].toUpperCase()
  m = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/)
  if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase()
  m = c.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)$/)
  if (m && (m[4] === undefined || Number(m[4]) > 0)) return [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase()
  return undefined
}

// Nome del font per Word dal valore CSS font-family (primo della lista; i nomi generici diventano font comuni).
function fontName(css: string): string {
  const first = css.split(',')[0].replace(/["']/g, '').trim()
  const generic: Record<string, string> = { monospace: 'Consolas', serif: 'Times New Roman', 'sans-serif': 'Arial', 'system-ui': 'Calibri', cursive: 'Comic Sans MS' }
  return generic[first.toLowerCase()] ?? first
}

// Aggiorna la formattazione ereditata in base al tag e allo stile dell'elemento.
function fmtFor(el: HTMLElement, f: Fmt): Fmt {
  const tag = tagOf(el)
  const st = el.style
  const o = { ...f }
  if (tag === 'b' || tag === 'strong' || /^(bold|[6-9]00)$/.test(st.fontWeight)) o.b = true
  if (tag === 'i' || tag === 'em' || st.fontStyle === 'italic') o.i = true
  const td = st.textDecorationLine || st.textDecoration
  if (tag === 'u' || /underline/.test(td)) o.u = true
  if (tag === 's' || /line-through/.test(td)) o.s = true
  if (tag === 'sub') o.va = 'subscript'
  if (tag === 'sup') o.va = 'superscript'
  if (tag === 'code' || tag === 'pre') o.font = 'Consolas'
  if (st.color) o.color = hex(st.color) ?? o.color
  if (st.backgroundColor) o.bg = hex(st.backgroundColor) ?? o.bg
  if (st.fontFamily) o.font = fontName(st.fontFamily)
  const m = st.fontSize.match(/^([\d.]+)(px|pt)$/)
  if (m) o.sz = Math.max(2, Math.round((m[2] === 'px' ? Number(m[1]) * 0.75 : Number(m[1])) * 2))
  if (tag === 'a' && el.getAttribute('href')) { o.href = el.getAttribute('href')!; o.u = true; o.color ??= '0563C1' }
  return o
}

// Un "run" di testo Word con la formattazione data. L'ordine degli elementi di rPr segue lo schema OOXML.
function run(text: string, f: Fmt): string {
  let p = ''
  if (f.font) p += `<w:rFonts w:ascii="${x(f.font)}" w:hAnsi="${x(f.font)}" w:cs="${x(f.font)}"/>`
  if (f.b) p += '<w:b/>'
  if (f.i) p += '<w:i/>'
  if (f.s) p += '<w:strike/>'
  if (f.color) p += `<w:color w:val="${f.color}"/>`
  if (f.sz) p += `<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>`
  if (f.u) p += '<w:u w:val="single"/>'
  if (f.bg) p += `<w:shd w:val="clear" w:color="auto" w:fill="${f.bg}"/>`
  if (f.va) p += `<w:vertAlign w:val="${f.va}"/>`
  return `<w:r>${p ? `<w:rPr>${p}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`
}

// Converte un nodo inline in XML di run (i link diventano w:hyperlink con relazione registrata nel contesto).
function runs(n: Node, f: Fmt, ctx: Ctx): string {
  if (n.nodeType === 3) {
    const t = (n.textContent ?? '').replace(/\s+/g, ' ')
    return t ? run(t, f) : ''
  }
  if (n.nodeType !== 1) return ''
  const el = n as HTMLElement
  if (tagOf(el) === 'br') return '<w:r><w:br/></w:r>'
  if (tagOf(el) === 'img') return imageRun(el, ctx)
  const nf = fmtFor(el, f)
  const inner = Array.from(el.childNodes).map((c) => runs(c, nf, ctx)).join('')
  if (tagOf(el) === 'a' && el.getAttribute('href') && inner) {
    ctx.links.push(el.getAttribute('href')!)
    return `<w:hyperlink r:id="rIdL${ctx.links.length}" w:history="1">${inner}</w:hyperlink>`
  }
  return inner
}

// Immagine inline Word da un <img> con data URI: registra il file in ctx.images e restituisce il run con il disegno. Dimensioni dagli attributi width/height (px), ridotte a 6 pollici di larghezza.
function imageRun(el: HTMLElement, ctx: Ctx): string {
  const m = (el.getAttribute('src') ?? '').match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/)
  if (!m || m[1] === 'webp') return ''
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const n = ctx.images.length + 1
  const ext = m[1]
  ctx.images.push({ rid: `rIdI${n}`, name: `image${n}.${ext}`, ext, bytes })
  let w = Number(el.getAttribute('width')) || 400
  let h = Number(el.getAttribute('height')) || 300
  if (w > 576) { h = (h * 576) / w; w = 576 }
  const cx = Math.round(w * 9525)
  const cy = Math.round(h * 9525)
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdI${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

// Un paragrafo Word con le opzioni date. L'ordine degli elementi di pPr segue lo schema OOXML.
function para(content: string, o: Para): string {
  let p = ''
  if (o.style) p += `<w:pStyle w:val="${o.style}"/>`
  if (o.pageBreak) p += '<w:pageBreakBefore/>'
  if (o.num) p += `<w:numPr><w:ilvl w:val="${o.num.lvl}"/><w:numId w:val="${o.num.id}"/></w:numPr>`
  if (o.quote) p += '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BBBBBB"/></w:pBdr>'
  if (o.rule) p += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>'
  if (o.shade) p += '<w:shd w:val="clear" w:color="auto" w:fill="F3F3F3"/>'
  if (o.shade) p += '<w:spacing w:after="0"/>'
  if (o.ind) p += `<w:ind w:left="${o.ind}"/>`
  if (o.jc) p += `<w:jc w:val="${o.jc}"/>`
  return `<w:p>${p ? `<w:pPr>${p}</w:pPr>` : ''}${content}</w:p>`
}

// Allineamento CSS -> valore di w:jc.
const JC: Record<string, string> = { left: 'left', center: 'center', right: 'right', justify: 'both' }

// Tabella Word: righe e celle (con colspan); ogni cella contiene i suoi blocchi.
function tableXml(el: HTMLElement, ctx: Ctx, f: Fmt): string {
  const rows = Array.from(el.querySelectorAll('tr'))
  const cells = rows.map((tr) => Array.from(tr.children).filter((c) => /^(td|th)$/.test(tagOf(c))) as HTMLElement[])
  const cols = Math.max(1, ...cells.map((r) => r.reduce((n, c) => n + (Number(c.getAttribute('colspan')) || 1), 0)))
  const w = Math.floor(9000 / cols)
  const border = (s: string) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`
  let t = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>`
  t += '<w:tblGrid>' + `<w:gridCol w:w="${w}"/>`.repeat(cols) + '</w:tblGrid>'
  for (const row of cells) {
    t += '<w:tr>'
    for (const c of row) {
      const span = Number(c.getAttribute('colspan')) || 1
      const inner = blocksXml(c, ctx, tagOf(c) === 'th' ? { ...f, b: true } : f, {}) || '<w:p/>'
      t += `<w:tc><w:tcPr><w:tcW w:w="${w * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr>${inner}</w:tc>`
    }
    t += '</w:tr>'
  }
  return t + '</w:tbl><w:p/>'
}

// Elenco puntato/numerato (anche annidato): un paragrafo per voce, con numerazione Word vera. Le liste numerate ricevono un nuovo numId per ripartire da 1.
function listXml(el: HTMLElement, ctx: Ctx, f: Fmt, lvl: number): string {
  const ordered = tagOf(el) === 'ol'
  let id = 1
  if (ordered) { ctx.ordered.push(ctx.ordered.length + 2); id = ctx.ordered[ctx.ordered.length - 1] }
  let out = ''
  for (const li of Array.from(el.children)) {
    if (tagOf(li) !== 'li') continue
    let buf = ''
    let nested = ''
    for (const c of Array.from(li.childNodes)) {
      if (c.nodeType === 1 && (tagOf(c) === 'ul' || tagOf(c) === 'ol')) nested += listXml(c as HTMLElement, ctx, f, Math.min(lvl + 1, 8))
      else buf += runs(c, f, ctx)
    }
    out += para(buf, { num: { id, lvl } }) + nested
  }
  return out
}

// Converte i figli di un nodo in paragrafi/tabelle Word. 'o' porta rientro e allineamento ereditati dai contenitori.
function blocksXml(parent: Node, ctx: Ctx, f: Fmt, o: Para): string {
  let out = ''
  let buf = ''
  const flush = () => {
    if (buf.replace(/<[^>]+>/g, '').trim() || buf.includes('<w:br/>') || buf.includes('<w:drawing>')) out += para(buf, o)
    buf = ''
  }
  for (const n of Array.from(parent.childNodes)) {
    if (!isBlock(n)) { buf += runs(n, f, ctx); continue }
    flush()
    const el = n as HTMLElement
    const tag = tagOf(el)
    const nf = fmtFor(el, f)
    const inherited: Para = { ...o, jc: JC[el.style.textAlign] ?? o.jc }
    const ml = parseFloat(el.style.marginLeft || el.style.paddingLeft || '0')
    if (ml > 0) inherited.ind = (o.ind ?? 0) + Math.round(ml * 15)
    if (tag === 'hr') out += para('', { rule: true })
    else if (/^h[1-4]$/.test(tag)) {
      const inner = Array.from(el.childNodes).map((c) => runs(c, nf, ctx)).join('')
      if (inner) out += para(inner, { ...inherited, style: 'Heading' + Math.min(Number(tag[1]), 3) })
    } else if (tag === 'ul' || tag === 'ol') out += listXml(el, ctx, f, 0)
    else if (tag === 'table') out += tableXml(el, ctx, f)
    else if (tag === 'pre') {
      for (const line of (el.textContent ?? '').replace(/\n$/, '').split('\n')) out += para(line ? run(line, { ...nf, font: 'Consolas' }) : '', { ...inherited, shade: true })
    } else if (tag === 'blockquote') out += blocksXml(el, ctx, f, { ...inherited, ind: (inherited.ind ?? 0) + 720, quote: true })
    else out += blocksXml(el, ctx, nf, inherited)
  }
  flush()
  return out
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

// Definizione degli stili usati (Normal, Title, Heading1-3).
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>`

// Definizioni di numerazione: astratto 0 = elenco puntato, astratto 1 = numerato (9 livelli); num 1 = puntato, num 2.. = numerati che ripartono da 1.
function numberingXml(orderedIds: number[]): string {
  const bullets = ['•', '◦', '▪']
  const lvls = (kind: 'bullet' | 'decimal') =>
    Array.from({ length: 9 }, (_, l) =>
      `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${kind}"/><w:lvlText w:val="${kind === 'bullet' ? bullets[l % 3] : `%${l + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + l * 360}" w:hanging="360"/></w:pPr></w:lvl>`,
    ).join('')
  const overrides = Array.from({ length: 9 }, (_, l) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="1"/></w:lvlOverride>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvls('bullet')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvls('decimal')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${orderedIds
    .map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/>${overrides}</w:num>`)
    .join('')}</w:numbering>`
}

// Costruisce il file .docx (titolo di ogni pagina + contenuto formattato; una pagina Word nuova per ogni nota). Le immagini (png/jpeg/gif) vengono incorporate. Restituisce il Blob da scaricare.
export function toDocx(pages: ExportPage[]): Blob {
  const ctx: Ctx = { links: [], ordered: [], images: [] }
  const body = pages
    .map((p, i) => para(run(p.title || 'Untitled', {}), { style: pages.length > 1 ? 'Heading1' : 'Title', pageBreak: i > 0 }) + blocksXml(sanitizedRoot(p.html), ctx, {}, {}))
    .join('')
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="${REL}/numbering" Target="numbering.xml"/>${ctx.links
    .map((u, i) => `<Relationship Id="rIdL${i + 1}" Type="${REL}/hyperlink" Target="${x(u)}" TargetMode="External"/>`)
    .join('')}${ctx.images.map((im) => `<Relationship Id="${im.rid}" Type="${REL}/image" Target="media/${im.name}"/>`).join('')}</Relationships>`
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...new Set(ctx.images.map((i) => i.ext))].map((e) => `<Default Extension="${e}" ContentType="image/${e}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`
  const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`
  const zip = makeZip([
    { name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: root },
    { name: 'word/document.xml', data: doc },
    { name: 'word/_rels/document.xml.rels', data: rels },
    { name: 'word/styles.xml', data: STYLES_XML },
    { name: 'word/numbering.xml', data: numberingXml(ctx.ordered) },
    ...ctx.images.map((im) => ({ name: `word/media/${im.name}`, data: im.bytes })),
  ])
  return new Blob([zip as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

// ============================ Punto d'ingresso ============================

// Formati disponibili nel menu Export di Notes.svelte.
export type ExportFormat = 'docx' | 'pdf' | 'html' | 'md' | 'txt'

// Esporta le pagine nel formato scelto: scarica il file (nome ricavato da 'title') oppure, per il PDF, apre la finestra di stampa. Chiamata da Notes.doExport().
export function exportPages(fmt: ExportFormat, title: string, pages: ExportPage[]) {
  const name = safeName(title)
  if (fmt === 'pdf') printPdf(title, pages)
  else if (fmt === 'docx') download(toDocx(pages), `${name}.docx`)
  else if (fmt === 'html') download(new Blob([toHtmlDoc(title, pages)], { type: 'text/html;charset=utf-8' }), `${name}.html`)
  else if (fmt === 'md') download(new Blob([toMarkdown(pages)], { type: 'text/markdown;charset=utf-8' }), `${name}.md`)
  else download(new Blob([toText(pages)], { type: 'text/plain;charset=utf-8' }), `${name}.txt`)
}
