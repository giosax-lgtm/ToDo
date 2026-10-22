<!--
  VISTA GANTT: i task della vista (filtri, ricerca e raggruppamento della bozza) come barre su una linea del tempo.
  Inizio = Task.start, altrimenti la data di creazione; fine = scadenza. Senza scadenza compare solo un segnaposto all'inizio.
  Barre: verde = completato, rosso = in ritardo, colore del gruppo = in corso; la parte piena e' l'avanzamento (passi/sotto-task). Sulla barra: titolo e responsabile.
  Trascinando una barra si spostano le date (bordo sinistro = inizio, bordo destro = scadenza): le nuove date vengono scritte nel task (store.updateTask),
  che a sua volta fa slittare i task che ne dipendono. Frecce = dipendenze (rosse se violate), rombo = milestone, linea sotto la barra = durata stimata (arancione se superata),
  barra grigia sottile = baseline (rossa se la scadenza e' slittata). Pulsanti per impostare la baseline ed esportare in PNG/PDF.
  Click su barra o nome = apre CardDetail. Montata da App.svelte quando la vista ha layout 'gantt'.
-->

<script lang="ts">
  import { store, today, daysBetween } from './store.svelte'
  import { COLORS } from './colors'
  import type { Task } from './types'

  const DAY = 86400000
  // Giorno 'yyyy-mm-dd' -> numero di giorni dall'epoca (UTC, cosi' non ci sono salti per l'ora legale) e viceversa.
  const num = (d: string) => Math.floor(Date.parse(d + 'T00:00:00Z') / DAY)
  const str = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)

  // Altezze delle righe in pixel (fisse: servono a disegnare le frecce delle dipendenze).
  const ROW = 34, GROUP = 26, HEAD = 44

  // Zoom: pixel per giorno.
  const ZOOMS = [{ k: 'day', label: 'Days', px: 32 }, { k: 'week', label: 'Weeks', px: 12 }, { k: 'month', label: 'Months', px: 4 }]
  let zoom = $state('week')
  let showBase = $state(true)
  const px = $derived(ZOOMS.find((z) => z.k === zoom)!.px)

  const td = today()

  // Percentuale di avanzamento di un task: completato = 100, altrimenti passi o sotto-task.
  function progress(t: Task) {
    if (t.done) return 100
    if (t.track) return store.stepStats(t.id).pct
    return t.subtasks.length ? Math.round((t.subtasks.filter((s) => s.done).length / t.subtasks.length) * 100) : 0
  }
  // Intervallo di un task in giorni; fine = inizio se manca la scadenza; se la scadenza precede l'inizio le due date si scambiano. Una milestone e' un solo giorno (la scadenza).
  function baseSpan(t: Task) {
    const a = num(store.startOf(t))
    const b = t.due ? num(t.due) : a
    if (t.milestone && t.due) return { s: b, e: b, dated: true }
    return { s: Math.min(a, b), e: Math.max(a, b), dated: !!t.due }
  }
  // Come baseSpan, ma durante un trascinamento il task trascinato mostra le date provvisorie.
  const span = (t: Task) => (drag?.id === t.id ? { s: drag.s, e: drag.e, dated: true } : baseSpan(t))

  // Trascinamento di una barra: 'move' sposta inizio e scadenza insieme, 'l' cambia solo l'inizio, 'r' solo la scadenza. Si aggancia ai giorni interi.
  // Al rilascio le nuove date vengono scritte nel task (Start date e Due date), quindi restano coerenti in tabella, board e dettaglio.
  type Drag = { id: string; mode: 'move' | 'l' | 'r'; day0: number; cs: number; ce: number; s: number; e: number; moved: boolean }
  let drag = $state<Drag | null>(null)
  // Giorno (frazionario) sotto il puntatore: indipendente dallo scorrimento e da eventuali allargamenti dell'intervallo, cosi' il trascinamento resta preciso mentre la linea del tempo scorre.
  function dayAt(clientX: number) {
    if (!scroller) return 0
    const nameW = (scroller.querySelector('.g-name') as HTMLElement | null)?.offsetWidth ?? 0
    return range.lo + (clientX - scroller.getBoundingClientRect().left - nameW + scroller.scrollLeft) / px
  }
  function startDrag(ev: PointerEvent, t: Task, mode: Drag['mode']) {
    if (ev.button !== 0) return
    ev.preventDefault()
    ev.stopPropagation()
    const r = baseSpan(t)
    const d: Drag = { id: t.id, mode, day0: dayAt(ev.clientX), cs: r.s, ce: r.e, s: r.s, e: r.e, moved: false }
    drag = d
    let cx = ev.clientX
    let raf = 0
    // Ricalcola le date provvisorie dalla posizione corrente del puntatore.
    const update = () => {
      const dd = Math.round(dayAt(cx) - d.day0)
      if (dd !== 0) d.moved = true
      const ms = t.milestone
      const s = mode === 'r' ? d.cs : mode === 'l' ? Math.min(d.cs + dd, d.ce) : d.cs + dd
      const e = mode === 'l' ? d.ce : mode === 'r' ? Math.max(d.ce + dd, d.cs) : d.ce + dd
      drag = { ...d, s: ms ? e : s, e }
    }
    // Scorrimento automatico: con il puntatore vicino al bordo sinistro/destro dell'area della linea del tempo, questa scorre (piu' veloce piu' ci si avvicina al bordo).
    const loop = () => {
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        const nameW = (scroller.querySelector('.g-name') as HTMLElement | null)?.offsetWidth ?? 0
        const ZONE = 70
        const left = cx - (box.left + nameW), right = box.right - cx
        const v = left < ZONE ? -Math.ceil(((ZONE - Math.max(left, -ZONE)) / ZONE) * 22) : right < ZONE ? Math.ceil(((ZONE - Math.max(right, -ZONE)) / ZONE) * 22) : 0
        if (v) {
          scroller.scrollLeft += v
          update()
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const move = (m: PointerEvent) => {
      cx = m.clientX
      update()
    }
    const up = () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const f = drag
      drag = null
      if (!f || !f.moved) { store.openTaskId = t.id; return }
      if (f.s !== f.cs || f.e !== f.ce) void store.updateTask(t.id, { start: str(f.s), due: str(f.e) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const sections = $derived(store.groups.map((g) => ({ g, rows: store.groupTasks(g) })).filter((x) => x.rows.length))
  const all = $derived(sections.flatMap((x) => x.rows))
  const grouped = $derived(store.draft.groupBy !== 'none')

  // Posizione verticale (px) di ogni riga-task e altezza totale del diagramma.
  const layout = $derived.by(() => {
    const y = new Map<string, number>()
    let cur = HEAD
    for (const sec of sections) {
      if (grouped) cur += GROUP
      for (const t of sec.rows) { y.set(t.id, cur); cur += ROW }
    }
    return { y, height: cur }
  })

  // Intervallo mostrato: dal primo inizio all'ultima scadenza (oggi incluso) con un margine; almeno 4 settimane. Considera anche la baseline.
  function computeRange(lo0: number, hi0: number) {
    let lo = lo0, hi = hi0
    for (const t of all) {
      const r = baseSpan(t)
      lo = Math.min(lo, r.s)
      hi = Math.max(hi, r.e)
      if (t.baseline) { lo = Math.min(lo, num(t.baseline.start)); hi = Math.max(hi, num(t.baseline.due)) }
    }
    if (drag) { lo = Math.min(lo, drag.s); hi = Math.max(hi, drag.e) } // durante il trascinamento la linea del tempo si allarga
    lo -= 3
    hi += 7
    if (hi - lo < 28) hi = lo + 28
    lo -= (new Date(lo * DAY).getUTCDay() + 6) % 7 // parte dal lunedi per allineare la griglia delle settimane
    return { lo, hi, days: hi - lo + 1 }
  }
  const range = $derived(computeRange(num(td), num(td)))
  const width = $derived(range.days * px)
  const x = (n: number) => (n - range.lo) * px

  // Intestazione: mesi (riga alta) e giorni o settimane (riga bassa).
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthsOf = (lo: number, days: number, w: number) => {
    const out: { label: string; left: number; w: number }[] = []
    for (let n = lo; n < lo + days; ) {
      const d = new Date(n * DAY)
      const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY
      const end = Math.min(next, lo + days)
      out.push({ label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, left: (n - lo) * w, w: (end - n) * w })
      n = end
    }
    return out
  }
  const months = $derived(monthsOf(range.lo, range.days, px))
  const ticksOf = (lo: number, days: number, w: number, mode: string) => {
    const out: { label: string; left: number; weekend: boolean; w: number }[] = []
    for (let n = lo; n < lo + days; n++) {
      const wd = (new Date(n * DAY).getUTCDay() + 6) % 7 // 0 = lunedi
      const day = new Date(n * DAY).getUTCDate()
      if (mode === 'day') out.push({ label: String(day), left: (n - lo) * w, weekend: wd > 4, w })
      else if (mode === 'week' && wd === 0) out.push({ label: String(day), left: (n - lo) * w, weekend: false, w: w * 7 })
      else if (mode === 'month' && day === 1) out.push({ label: '', left: (n - lo) * w, weekend: false, w: w * 30 })
    }
    return out
  }
  const ticks = $derived(ticksOf(range.lo, range.days, px, zoom))

  // Responsabili del task (nomi del campo "Assignee" della lista), testo della barra e suggerimento.
  const people = (t: Task) => {
    const f = store.peopleField()
    return f ? (t.tags[f.id] ?? []).map((id) => store.options.find((o) => o.id === id)?.label).filter((l): l is string => !!l) : []
  }
  const late = (t: Task) => !t.done && !!t.due && t.due < td
  const label = (t: Task) => [t.title, people(t).join(', ')].filter(Boolean).join(' · ')
  const spanDays = (t: Task) => { const r = baseSpan(t); return r.e - r.s + 1 }
  const slip = (t: Task) => (t.baseline && t.due ? daysBetween(t.baseline.due, t.due) : 0)
  const tip = (t: Task) => {
    const r = span(t)
    const lines = [label(t), `${str(r.s)}${t.due ? ' → ' + t.due : ' (no due date)'} · ${progress(t)}%${late(t) ? ' · overdue' : ''}`]
    if (t.milestone) lines.push('Milestone')
    if (t.est) {
      const act = t.done && t.doneAt ? daysBetween(store.startOf(t), t.doneAt) + 1 : null
      lines.push(`Estimate ${t.est}d · planned ${spanDays(t)}d` + (act != null ? ` · actual ${act}d` : ''))
    }
    if (t.baseline) lines.push(`Baseline ${t.baseline.start} → ${t.baseline.due}` + (slip(t) ? ` (${slip(t) > 0 ? '+' : ''}${slip(t)}d)` : ''))
    return lines.join('\n')
  }

  // Frecce delle dipendenze (fine predecessore -> inizio successore); rosse se il successore inizia prima della fine del predecessore.
  const ARROW = (x1: number, y1: number, x2: number, y2: number) =>
    x2 >= x1 + 10
      ? `M${x1} ${y1} H${x1 + 5} V${y2} H${x2}`
      : `M${x1} ${y1} H${x1 + 6} V${y2 > y1 ? y2 - ROW / 2 : y2 + ROW / 2} H${x2 - 6} V${y2} H${x2}`
  const arrows = $derived.by(() => {
    const out: { id: string; d: string; bad: boolean }[] = []
    for (const t of all) {
      for (const pid of t.deps ?? []) {
        const p = all.find((x) => x.id === pid)
        const py = layout.y.get(pid), ty = layout.y.get(t.id)
        if (!p || py == null || ty == null) continue
        const a = span(p), b = span(t)
        out.push({ id: pid + t.id, d: ARROW(x(a.e + 1), py + ROW / 2, x(b.s), ty + ROW / 2), bad: b.s <= a.e })
      }
    }
    return out
  })

  let scroller = $state<HTMLElement>()
  const toToday = () => {
    if (scroller) scroller.scrollLeft = Math.max(0, x(num(td)) - scroller.clientWidth / 3)
  }
  // Quando l'intervallo si allarga/restringe a sinistra il contenuto si sposta: compensa lo scorrimento cosi' quello che si guarda resta fermo.
  let prevLo: number | null = null
  $effect(() => {
    const lo = range.lo
    if (scroller && prevLo != null && lo !== prevLo) scroller.scrollLeft = Math.max(0, scroller.scrollLeft + (prevLo - lo) * px)
    prevLo = lo
  })
  // Porta la linea di "oggi" in vista all'apertura e al cambio di zoom.
  $effect(() => {
    void px
    toToday()
  })

  // Baseline: congela le date attuali di tutti i task con scadenza (chiede conferma se ne esiste gia' una) oppure la cancella.
  const hasBase = $derived(all.some((t) => t.baseline))
  function setBase() {
    if (hasBase && !confirm('Replace the current baseline with the current dates?')) return
    void store.setBaseline()
  }
  function clearBase() {
    if (confirm('Remove the baseline from all tasks of this list?')) void store.setBaseline(true)
  }

  // ---------- esportazione ----------
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const clip = (s: string, w: number, cw = 6.4) => { const n = Math.floor(w / cw); return n < 3 ? '' : s.length > n ? s.slice(0, n - 1) + '…' : s }

  // Disegno del diagramma come SVG autonomo (colori chiari fissi, indipendente dal tema): stessa struttura della vista, adattato a una larghezza ragionevole.
  function buildSvg() {
    const NAME = 230, TITLE = 34
    const r = computeRange(num(td), num(td))
    const w = Math.max(3, Math.min(28, Math.floor(1700 / r.days)))
    const W = NAME + r.days * w
    const X = (n: number) => NAME + (n - r.lo) * w
    const yy = new Map<string, number>()
    let y = TITLE + HEAD
    for (const sec of sections) {
      if (grouped) y += GROUP
      for (const t of sec.rows) { yy.set(t.id, y); y += ROW }
    }
    const H = y + 8
    const o: string[] = []
    o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif" font-size="12">`)
    o.push(`<defs><marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7z" fill="#6b7280"/></marker><marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7z" fill="#c0392b"/></marker></defs>`)
    o.push(`<rect width="${W}" height="${H}" fill="#fff"/>`)
    o.push(`<text x="10" y="22" font-size="16" font-weight="700" fill="#1d1c1d">${esc(store.currentProject?.name ?? '')} — Gantt</text><text x="${W - 10}" y="22" text-anchor="end" fill="#616061">Exported ${td}</text>`)
    o.push(`<rect x="0" y="${TITLE}" width="${W}" height="${HEAD}" fill="#f1f1f1"/>`)
    for (const m of monthsOf(r.lo, r.days, w)) o.push(`<line x1="${NAME + m.left}" x2="${NAME + m.left}" y1="${TITLE}" y2="${H}" stroke="#ddd"/><text x="${NAME + m.left + 5}" y="${TITLE + 15}" font-weight="700" fill="#333">${esc(m.label)}</text>`)
    for (const k of ticksOf(r.lo, r.days, w, w >= 14 ? 'day' : 'week')) {
      if (k.weekend) o.push(`<rect x="${NAME + k.left}" y="${TITLE + HEAD}" width="${k.w}" height="${H - TITLE - HEAD}" fill="#f6f6f6"/>`)
      if (k.label && k.w >= 12) o.push(`<text x="${NAME + k.left + k.w / 2}" y="${TITLE + 36}" text-anchor="middle" fill="#666" font-size="10">${k.label}</text>`)
    }
    for (const sec of sections) {
      if (grouped) {
        const first = yy.get(sec.rows[0].id)! - GROUP
        const c = COLORS[sec.g.color] ?? COLORS.gray
        o.push(`<rect x="0" y="${first}" width="${W}" height="${GROUP}" fill="${c.bg}"/><text x="10" y="${first + 17}" font-weight="700" fill="${c.fg}">${esc(sec.g.label)} (${sec.rows.length})</text>`)
      }
      for (const t of sec.rows) {
        const ty = yy.get(t.id)!
        const c = COLORS[sec.g.color] ?? COLORS.gray
        o.push(`<line x1="0" x2="${W}" y1="${ty + ROW}" y2="${ty + ROW}" stroke="#e6e6e6"/>`)
        o.push(`<text x="10" y="${ty + 21}" fill="${t.done ? '#888' : '#1d1c1d'}"${t.done ? ' text-decoration="line-through"' : ''}>${esc(clip(t.title, NAME - 16))}</text>`)
        const b = baseSpan(t)
        if (showBase && t.baseline) {
          const bs = num(t.baseline.start), be = num(t.baseline.due)
          o.push(`<rect x="${X(bs)}" y="${ty + 25}" width="${(be - bs + 1) * w}" height="3" rx="1.5" fill="${slip(t) > 0 ? '#c0392b' : '#9aa0a6'}"/>`)
        }
        if (!b.dated) { o.push(`<text x="${X(b.s)}" y="${ty + 21}" fill="#888" font-size="10">◆ no due date</text>`); continue }
        if (t.milestone) {
          const cx = X(b.s) + w / 2, cy = ty + 14
          o.push(`<path d="M${cx} ${cy - 8}L${cx + 8} ${cy}L${cx} ${cy + 8}L${cx - 8} ${cy}z" fill="${late(t) ? '#c0392b' : t.done ? '#2e9e4f' : c.fg}"/><text x="${cx + 12}" y="${cy + 4}" fill="#1d1c1d">${esc(label(t))}</text>`)
          continue
        }
        const col = t.done ? '#2e9e4f' : late(t) ? '#c0392b' : c.fg
        const bx = X(b.s), bw = Math.max((b.e - b.s + 1) * w, 8), p = progress(t)
        o.push(`<rect x="${bx}" y="${ty + 5}" width="${bw}" height="19" rx="5" fill="${col}" fill-opacity="0.25" stroke="${col}"/><rect x="${bx}" y="${ty + 5}" width="${bw * p / 100}" height="19" rx="5" fill="${col}" fill-opacity="0.75"/>`)
        const txt = clip(label(t), bw - 10)
        if (txt) o.push(`<text x="${bx + 6}" y="${ty + 19}" fill="#111" font-weight="600">${esc(txt)}</text>`)
        if (t.est) o.push(`<rect x="${bx}" y="${ty + 30}" width="${t.est * w}" height="2" fill="${spanDays(t) > t.est ? '#e67e22' : '#9aa0a6'}"/>`)
      }
    }
    const tx = X(num(td)) + w / 2
    o.push(`<line x1="${tx}" x2="${tx}" y1="${TITLE + HEAD}" y2="${H}" stroke="#d9534f" stroke-width="2"/>`)
    for (const t of all) {
      for (const pid of t.deps ?? []) {
        const p = all.find((q) => q.id === pid)
        const py = yy.get(pid), ty = yy.get(t.id)
        if (!p || py == null || ty == null) continue
        const a = baseSpan(p), b = baseSpan(t)
        const bad = b.s <= a.e
        const x1 = X(a.e + 1), y1 = py + ROW / 2, x2 = X(b.s), y2 = ty + ROW / 2
        const d = x2 >= x1 + 10 ? `M${x1} ${y1} H${x1 + 5} V${y2} H${x2}` : `M${x1} ${y1} H${x1 + 6} V${y2 > y1 ? y2 - ROW / 2 : y2 + ROW / 2} H${x2 - 6} V${y2} H${x2}`
        o.push(`<path d="${d}" fill="none" stroke="${bad ? '#c0392b' : '#6b7280'}" stroke-width="1.3" marker-end="url(#${bad ? 'ar' : 'ah'})"/>`)
      }
    }
    o.push('</svg>')
    return { svg: o.join(''), W, H }
  }

  const fileBase = () => (store.currentProject?.name ?? 'project').replace(/[^\w-]+/g, '_') + '-gantt'
  // Scarica il diagramma come immagine PNG (SVG disegnato su un canvas a risoluzione doppia, ridotta se enorme).
  function exportPng() {
    const { svg, W, H } = buildSvg()
    const scale = Math.min(2, 12000 / W)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = Math.round(W * scale)
      c.height = Math.round(H * scale)
      const g = c.getContext('2d')!
      g.scale(scale, scale)
      g.drawImage(img, 0, 0)
      c.toBlob((b) => {
        if (!b) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = fileBase() + '.png'
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      })
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  }
  // Apre la stampa del diagramma in un iframe nascosto: da li' si sceglie "Salva come PDF" (pagina A4 orizzontale, adattata alla larghezza).
  function exportPdf() {
    const { svg, W, H } = buildSvg()
    const f = document.createElement('iframe')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    f.srcdoc = `<!doctype html><title>${esc(fileBase())}</title><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0}svg{width:100%;height:auto;max-height:190mm}</style>${svg.replace(`width="${W}" height="${H}"`, `preserveAspectRatio="xMinYMin meet"`)}`
    f.onload = () => {
      f.contentWindow?.focus()
      f.contentWindow?.print()
      setTimeout(() => f.remove(), 60000)
    }
    document.body.appendChild(f)
  }
</script>

<div class="gantt-wrap">
  <div class="gantt-bar">
    <span class="muted">{all.length} task{all.length === 1 ? '' : 's'}</span>
    <span class="spacer"></span>
    {#each ZOOMS as z (z.k)}
      <button class="chip" class:active={zoom === z.k} onclick={() => (zoom = z.k)}>{z.label}</button>
    {/each}
    <button class="chip" onclick={toToday}>Today</button>
    <span class="g-sep"></span>
    <button class="chip" title="Freeze the current dates as the plan, to see later slippage" onclick={setBase}>{hasBase ? '⟳ Reset baseline' : '⚑ Set baseline'}</button>
    {#if hasBase}
      <button class="chip" class:active={showBase} title="Show or hide the baseline" onclick={() => (showBase = !showBase)}>Baseline</button>
      <button class="chip" title="Remove the baseline" onclick={clearBase}>✕</button>
    {/if}
    <span class="g-sep"></span>
    <button class="chip" title="Download the chart as an image" onclick={exportPng} disabled={!all.length}>⤓ PNG</button>
    <button class="chip" title="Print or save the chart as PDF" onclick={exportPdf} disabled={!all.length}>⤓ PDF</button>
  </div>

  {#if !all.length}
    <p class="muted gantt-empty">No tasks to show. Add tasks (with a due date) or change the filters of this view.</p>
  {:else}
    <div class="gantt-scroll" bind:this={scroller}>
      <div class="gantt" style:width="calc(var(--gantt-name) + {width}px)">
        <svg class="g-arrows" width={width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="g-ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7z" fill="#6b7280" /></marker>
            <marker id="g-ar" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7z" fill="#c0392b" /></marker>
          </defs>
          {#each arrows as a (a.id)}
            <path d={a.d} fill="none" stroke={a.bad ? '#c0392b' : '#6b7280'} stroke-width="1.3" marker-end="url(#{a.bad ? 'g-ar' : 'g-ah'})" />
          {/each}
        </svg>

        <div class="g-row g-head">
          <div class="g-name g-corner"></div>
          <div class="g-line" style:width="{width}px">
            {#each months as m (m.left)}<div class="g-month" style:left="{m.left}px" style:width="{m.w}px">{m.label}</div>{/each}
            {#each ticks as t (t.left)}<div class="g-tick" class:weekend={t.weekend} style:left="{t.left}px" style:width="{t.w}px">{t.label}</div>{/each}
          </div>
        </div>

        {#each sections as sec (sec.g.key)}
          {#if grouped}
            <div class="g-row g-group">
              <div class="g-name" style:background={COLORS[sec.g.color]?.bg} style:color={COLORS[sec.g.color]?.fg}>{sec.g.label} <small>{sec.rows.length}</small></div>
              <div class="g-line" style:width="{width}px"></div>
            </div>
          {/if}
          {#each sec.rows as t (t.id)}
            {@const r = span(t)}
            {@const p = progress(t)}
            {@const wpx = (r.e - r.s + 1) * px}
            <div class="g-row" class:done={t.done}>
              <button class="g-name" title={t.title} onclick={() => (store.openTaskId = t.id)}>{t.title}</button>
              <div class="g-line" style:width="{width}px">
                {#each ticks as k (k.left)}{#if k.weekend}<i class="g-we" style:left="{k.left}px" style:width="{k.w}px"></i>{/if}{/each}
                <i class="g-today" style:left="{x(num(td)) + px / 2}px"></i>
                {#if showBase && t.baseline}
                  <i class="g-base" class:slip={slip(t) > 0} style:left="{x(num(t.baseline.start))}px" style:width="{(num(t.baseline.due) - num(t.baseline.start) + 1) * px}px"></i>
                {/if}
                {#if !r.dated}
                  <button class="g-nodue" title={tip(t)} style:left="{x(r.s)}px" onclick={() => (store.openTaskId = t.id)}>◆ no due date</button>
                {:else if t.milestone}
                  <div class="g-ms" class:done={t.done} class:late={late(t)} class:dragging={drag?.id === t.id} role="button" tabindex="0" title={tip(t)}
                    style:left="{x(r.s) + px / 2}px" style:--gc={COLORS[sec.g.color]?.fg ?? '#1264a3'}
                    onpointerdown={(e) => startDrag(e, t, 'move')} onkeydown={(e) => { if (e.key === 'Enter') store.openTaskId = t.id }}>
                    <i></i><span>{label(t)}</span>
                    {#if drag?.id === t.id}<em class="g-drag">{str(r.s)}</em>{/if}
                  </div>
                {:else}
                  <div class="g-barx" class:done={t.done} class:late={late(t)} class:dragging={drag?.id === t.id} role="button" tabindex="0" title={tip(t)}
                    style:left="{x(r.s)}px" style:width="{Math.max(wpx, 10)}px"
                    style:--gc={COLORS[sec.g.color]?.fg ?? '#1264a3'}
                    onpointerdown={(e) => startDrag(e, t, 'move')}
                    onkeydown={(e) => { if (e.key === 'Enter') store.openTaskId = t.id }}>
                    <span class="g-fill" style:width="{p}%"></span>
                    <span class="g-grip l" onpointerdown={(e) => startDrag(e, t, 'l')} role="presentation"></span>
                    {#if wpx > 40}<span class="g-pct">{label(t)}{wpx > 260 ? ` · ${p}%` : ''}</span>{/if}
                    <span class="g-grip r" onpointerdown={(e) => startDrag(e, t, 'r')} role="presentation"></span>
                    {#if drag?.id === t.id}<span class="g-drag">{str(r.s)} → {str(r.e)}</span>{/if}
                  </div>
                  {#if t.est}
                    <i class="g-est" class:over={spanDays(t) > t.est} style:left="{x(r.s)}px" style:width="{t.est * px}px"></i>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        {/each}
      </div>
    </div>
  {/if}
</div>
