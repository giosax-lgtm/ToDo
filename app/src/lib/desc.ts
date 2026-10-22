// FORMATO DELLA DESCRIZIONE DEI TASK. Le descrizioni nuove sono HTML sanificato (sanitizeHtml, lib/notehtml.ts) con il prefisso HTML_MARK;
// quelle vecchie sono testo semplice (con URL e immagini ![nome](data:...)) e vengono convertite al volo in HTML alla prima apertura nell'editor.
// Usato da RichText.svelte (editor), Card.svelte (anteprima) e store.svelte.ts (ricerca).

import { escapeHtml, sanitizeHtml } from './notehtml'

export const HTML_MARK = '<!--h-->'

export const isHtmlDesc = (s: string) => s.startsWith(HTML_MARK)

// Testo semplice -> HTML: a capo diventano paragrafi, URL link, immagini markdown tag <img>.
function legacyToHtml(text: string): string {
  const re = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)|(https?:\/\/[^\s<>'")\]]+)/gi
  return text
    .split(/\n/)
    .map((line) => {
      let out = ''
      let cursor = 0
      for (const m of line.matchAll(re)) {
        const at = m.index ?? 0
        out += escapeHtml(line.slice(cursor, at))
        out += m[1] ? `<img src="${m[1]}">` : `<a href="${escapeHtml(m[2])}">${escapeHtml(m[2])}</a>`
        cursor = at + m[0].length
      }
      out += escapeHtml(line.slice(cursor))
      return `<div>${out || '<br>'}</div>`
    })
    .join('')
}

// HTML pulito da mostrare/modificare, qualunque sia il formato salvato.
export function descHtml(desc: string): string {
  if (!desc) return ''
  return sanitizeHtml(isHtmlDesc(desc) ? desc.slice(HTML_MARK.length) : legacyToHtml(desc))
}

// HTML dell'editor -> valore da salvare ('' se non c'e' testo ne' immagini).
export function toStored(html: string): string {
  const clean = sanitizeHtml(html)
  const probe = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html').body
  if (!probe.textContent?.trim() && !probe.querySelector('img, hr')) return ''
  return HTML_MARK + clean
}

// Solo testo (per la ricerca): per le descrizioni HTML si legge il testo dei nodi, per le vecchie la stringa stessa.
export function descPlain(desc: string): string {
  if (!isHtmlDesc(desc)) return desc
  return new DOMParser().parseFromString(`<body>${desc.slice(HTML_MARK.length)}</body>`, 'text/html').body.textContent ?? ''
}
