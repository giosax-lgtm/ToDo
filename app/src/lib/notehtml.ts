// SANIFICAZIONE DELL'HTML DELLE NOTE. Ogni contenuto formattato (incollato da Word/web o prodotto dall'editor) passa da sanitizeHtml() prima di essere salvato o mostrato:
// si tiene solo una lista bianca di tag, attributi e proprieta' di stile, cosi' non puo' entrare codice eseguibile (script, onclick, javascript:, url()...).
// Usato da Notes.svelte (editor, incolla, salvataggio) e, per le esportazioni, da lib/noteexport.ts. Funziona solo nel browser (usa DOMParser).

import type { NoteBox } from './types'

// Tag ammessi, con quelli "equivalenti" riscritti: font -> span, strike/del -> s, b/i/strong/em restano.
const TAGS = new Set([
  'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'span', 'font', 'sub', 'sup',
  'ul', 'ol', 'li', 'a', 'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img',
])
// Tag il cui contenuto va scartato del tutto (non solo il tag).
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'head', 'title', 'meta', 'link'])
// Proprieta' CSS ammesse (formattazione del testo, non layout).
const STYLES = new Set(['font-family', 'font-size', 'color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'margin-left', 'padding-left'])
// Valore CSS accettato: niente url(), expression, backslash, parentesi non di colore, punto e virgola.
const SAFE_VALUE = /^[\w\s#%.,'"()-]+$/
const FORBIDDEN = /url\s*\(|expression|javascript|@import|\\|<|>/i

// Corpo del documento ottenuto da una stringa HTML senza eseguire nulla (DOMParser non esegue script ne' carica risorse).
function parse(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body
}

// Pulisce lo stile di un elemento: tiene solo le proprieta' ammesse con valori sicuri. Restituisce la stringa style da applicare (puo' essere vuota).
function cleanStyle(el: HTMLElement): string {
  const out: string[] = []
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i]
    const val = el.style.getPropertyValue(prop).trim()
    if (!STYLES.has(prop) || !val || FORBIDDEN.test(val) || !SAFE_VALUE.test(val)) continue
    out.push(`${prop}: ${val}`)
  }
  return out.join('; ')
}

// Immagini ammesse: solo data URI base64 di formati comuni (le immagini remote sono bloccate dalla CSP e non si salvano).
const IMG_SRC = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/

// Dimensioni del vecchio attributo <font size="1..7"> in px (come le usano i browser).
const FONT_PX = ['', '10px', '13px', '16px', '18px', '24px', '32px', '48px']

// Copia ricorsivamente in 'dst' solo cio' che e' ammesso dei figli di 'src'. I tag non ammessi vengono "srotolati" (si tiene il contenuto, non il tag).
function copy(src: Node, dst: Node, doc: Document) {
  for (const n of Array.from(src.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) {
      dst.appendChild(doc.createTextNode(n.textContent ?? ''))
      continue
    }
    if (n.nodeType !== Node.ELEMENT_NODE) continue
    const el = n as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (DROP.has(tag)) continue
    if (!TAGS.has(tag)) {
      copy(el, dst, doc)
      continue
    }
    if (tag === 'img' && !IMG_SRC.test((el.getAttribute('src') ?? '').trim())) continue
    const outTag = tag === 'font' ? 'span' : tag === 'strike' || tag === 'del' ? 's' : tag
    const out = doc.createElement(outTag)
    let style = cleanStyle(el)
    if (tag === 'font') {
      const color = el.getAttribute('color')
      const face = el.getAttribute('face')
      const size = Number(el.getAttribute('size'))
      if (color && /^#?[\w]+$/.test(color)) style += `; color: ${color}`
      if (face && SAFE_VALUE.test(face) && !FORBIDDEN.test(face)) style += `; font-family: ${face}`
      if (size >= 1 && size <= 7) style += `; font-size: ${FONT_PX[size]}`
    }
    style = style.replace(/^;\s*/, '')
    if (style) out.setAttribute('style', style)
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/i.test(href.trim())) {
        out.setAttribute('href', href.trim())
        out.setAttribute('target', '_blank')
        out.setAttribute('rel', 'noopener noreferrer')
      }
    }
    if (tag === 'img') {
      out.setAttribute('src', el.getAttribute('src')!.trim())
      for (const a of ['width', 'height']) {
        const v = Number(el.getAttribute(a))
        if (v >= 1 && v <= 5000) out.setAttribute(a, String(Math.round(v)))
      }
    }
    if ((tag === 'td' || tag === 'th') && el.getAttribute('colspan')) {
      const c = Number(el.getAttribute('colspan'))
      if (c > 1 && c < 50) out.setAttribute('colspan', String(c))
    }
    copy(el, out, doc)
    dst.appendChild(out)
  }
}

// API principale: restituisce HTML pulito (solo tag, link e stili ammessi). Chiamata dall'editor a ogni salvataggio e a ogni incolla.
/** Strips everything except a whitelist of formatting tags/styles. */
export function sanitizeHtml(html: string): string {
  const src = parse(html)
  const doc = src.ownerDocument
  const dst = doc.createElement('div')
  copy(src, dst, doc)
  return dst.innerHTML
}

// Come sanitizeHtml ma restituisce il nodo (contenitore) pronto da analizzare, usato dalle esportazioni.
export function sanitizedRoot(html: string): HTMLElement {
  const src = parse(html)
  const doc = src.ownerDocument
  const dst = doc.createElement('div')
  copy(src, dst, doc)
  return dst
}

// Escape dei caratteri speciali HTML in un testo (titoli delle pagine nei documenti esportati).
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// HTML unico di una pagina: le caselle in ordine di lettura (dall'alto in basso, poi da sinistra), oppure il vecchio 'html'. Usato dalle esportazioni.
export function pageHtml(p: { html: string; boxes?: NoteBox[] }): string {
  if (!p.boxes?.length) return p.html
  return [...p.boxes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((b) => `<div>${b.html}</div>`)
    .join('')
}
