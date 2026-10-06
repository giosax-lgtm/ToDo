// AZIONE SVELTE 'resizer': maniglia di trascinamento per ridimensionare un pannello (sidebar, pannello dettaglio).
// Legge/scrive la larghezza tramite store.width()/setWidth() (lib/store.svelte.ts), che la salva in IndexedDB.
// Usata con use:resizer in Sidebar.svelte e CardDetail.svelte; lo stile della maniglia (.resizer) e' in app.css.

import { store } from './store.svelte'

// Opzioni: chiave di salvataggio, direzione (1 = maniglia sul bordo destro, -1 = sinistro), limiti min/max e larghezza di default.
interface Opts {
  key: string
  /** 1: handle on the right edge of the panel (grow when dragged right); -1: left edge */
  dir: 1 | -1
  min: number
  max: number
  fallback: number
}

// L'azione vera e propria: registra il pointerdown sulla maniglia; update() aggiorna le opzioni, destroy() toglie i listener.
/** Svelte action for a drag handle that resizes a panel; width is remembered. */
export function resizer(node: HTMLElement, o: Opts) {
  let current = o
  // Inizio trascinamento: cattura il puntatore e, a ogni movimento, calcola la nuova larghezza (limitata a min/max) e la salva nello store.
  const onDown = (e: PointerEvent) => {
    e.preventDefault()
    node.setPointerCapture(e.pointerId)
    node.classList.add('drag')
    const startX = e.clientX
    const startW = store.width(current.key, current.fallback)
    // Movimento del puntatore: nuova larghezza = larghezza iniziale + spostamento orizzontale (nella direzione scelta).
    const move = (ev: PointerEvent) => {
      const w = startW + (ev.clientX - startX) * current.dir
      store.setWidth(current.key, Math.min(current.max, Math.max(current.min, w)))
    }
    // Fine trascinamento: rimuove la classe 'drag' e i listener temporanei.
    const up = () => {
      node.classList.remove('drag')
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
    }
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
  }
  node.addEventListener('pointerdown', onDown)
  return {
    update(n: Opts) { current = n },
    destroy() { node.removeEventListener('pointerdown', onDown) },
  }
}
