import { store } from './store.svelte'

interface Opts {
  key: string
  /** 1: handle on the right edge of the panel (grow when dragged right); -1: left edge */
  dir: 1 | -1
  min: number
  max: number
  fallback: number
}

/** Svelte action for a drag handle that resizes a panel; width is remembered. */
export function resizer(node: HTMLElement, o: Opts) {
  let current = o
  const onDown = (e: PointerEvent) => {
    e.preventDefault()
    node.setPointerCapture(e.pointerId)
    node.classList.add('drag')
    const startX = e.clientX
    const startW = store.width(current.key, current.fallback)
    const move = (ev: PointerEvent) => {
      const w = startW + (ev.clientX - startX) * current.dir
      store.setWidth(current.key, Math.min(current.max, Math.max(current.min, w)))
    }
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
