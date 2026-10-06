import Sortable from 'sortablejs'

interface Opts {
  /** CSS selector of draggable items inside the container */
  item: string
  /** group name; containers sharing it exchange items */
  group: string
  handle?: string
  /** disable reordering inside the list (items can still be moved between lists) */
  sort?: boolean
  /** called after a drop; DOM is already restored so Svelte can re-render from state */
  onMove: (id: string, toContainer: HTMLElement, newIndex: number) => void
}

/** Svelte action: drag & drop that updates state only (Svelte owns the DOM). */
export function sortable(node: HTMLElement, opts: Opts) {
  let current = opts
  let before: Element | null = null
  const s = Sortable.create(node, {
    group: {
      name: opts.group,
      put: (to) => (to.el as HTMLElement).dataset.drop !== '0',
    },
    animation: 120,
    delay: 150,
    delayOnTouchOnly: true,
    ghostClass: 'drag-ghost',
    draggable: opts.item,
    handle: opts.handle,
    // let links be clicked instead of starting a drag (and don't cancel the click)
    filter: 'a',
    preventOnFilter: false,
    sort: opts.sort ?? true,
    onStart(evt) {
      before = evt.item.nextElementSibling
    },
    onEnd(evt) {
      const { item, from, to, newIndex } = evt
      // Undo Sortable's DOM move: state drives the DOM. (Restore by neighbour, not by index:
      // indexes only count draggable items, so they drift when other children are present.)
      to.removeChild(item)
      from.insertBefore(item, before)
      const id = item.dataset.id
      if (id && newIndex !== undefined) current.onMove(id, to as HTMLElement, newIndex)
    },
  })
  return {
    update(o: Opts) {
      current = o
      s.option('sort', o.sort ?? true)
      s.option('draggable', o.item)
    },
    destroy() {
      s.destroy()
    },
  }
}
