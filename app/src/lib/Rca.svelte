<!--
  TOOL "ANALISI DELLE CAUSE RADICE" (RCA): diagrammi interattivi 5 Perche' (albero) e Lisca di pesce (Ishikawa). Ogni analisi e' un record della tabella 'rca'
  (store.rcas) con i suoi nodi; puo' essere collegata a un task che sta indagando, e le cause radice possono diventare task di azione correttiva.
  La geometria (posizioni, righe di testo) viene da rcalayout.ts, cosi' il disegno a schermo e le esportazioni usano gli stessi numeri.
  Uso: click = seleziona; doppio click o Invio = scrivi; Tab = aggiungi figlio; Canc = elimina; trascina un nodo su un altro per spostarlo.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { COLORS, COLOR_KEYS } from './colors'
  import { estimate, FONT, layoutRca, subtreeIds, type Measure } from './rcalayout'
  import { exportRca, type RcaFormat } from './rcaexport'
  import RcaIsNot from './RcaIsNot.svelte'
  import RcaPareto from './RcaPareto.svelte'
  import type { Rca, RcaNode } from './types'

  const KINDS: Record<Rca['kind'], { label: string; hint: string }> = {
    whys: {
      label: '5 Whys',
      hint: 'Write the problem on the left, then keep asking “why?”. Branch when there is more than one answer. Mark the real origin with ★ and turn it into a task. Use ✕ to rule out a branch that led nowhere.',
    },
    fishbone: {
      label: 'Fishbone (Ishikawa)',
      hint: 'The effect is on the right; each bone is a category of causes. Add causes and sub-causes to the bones, rename or add categories, mark the likely root causes with ★ and rule out dead ends with ✕.',
    },
    faulttree: {
      label: 'Fault tree',
      hint: 'The top event is the failure. Under each event, a gate joins its causes: OR = any one is enough, AND = all must happen together (click the gate to switch). Leaves are basic events.',
    },
    isnot: {
      label: 'Is / Is-Not',
      hint: 'Narrow the problem down before looking for causes: describe what it IS and what it IS NOT (what, where, when, how much), then note what is distinctive or what changed.',
    },
    pareto: {
      label: 'Pareto',
      hint: 'Which few causes produce most of the problem? Enter each cause with how often it happened: the chart sorts them and marks the vital few that make up 80%.',
    },
  }

  const rca = $derived(store.rcaList.find((r) => r.id === store.pref('rcaId', '')) ?? store.rcaList[0])
  const nodes = $derived(rca?.nodes ?? [])
  const isTree = $derived(rca?.kind === 'whys' || rca?.kind === 'fishbone' || rca?.kind === 'faulttree')

  // Misura del testo con il canvas, con lo stesso font dei box.
  let ctx: CanvasRenderingContext2D | null = null
  const measure: Measure = (t) => {
    ctx ??= document.createElement('canvas').getContext('2d')
    if (!ctx) return estimate(t)
    ctx.font = `${FONT}px ${getComputedStyle(document.body).fontFamily}`
    return ctx.measureText(t).width
  }

  // Nodo selezionato / in modifica e testo provvisorio: mentre si scrive il box cresce in tempo reale.
  let sel = $state<string | null>(null)
  let editing = $state<string | null>(null)
  let draft = $state('')
  const view = $derived<Rca | undefined>(rca ? { ...rca, nodes: nodes.map((n) => (n.id === editing ? { ...n, text: draft } : n)) } : undefined)
  const lay = $derived(view ? layoutRca(view, measure) : { boxes: [], lines: [], width: 0, height: 0 })
  const byId = (id: string | null) => nodes.find((n) => n.id === id)
  const selNode = $derived(byId(sel))
  const selBox = $derived(lay.boxes.find((b) => b.id === sel))

  let zoom = $state(1)
  let scroller = $state<HTMLDivElement>()

  // Selezione dell'analisi attiva: se la selezionata sparisce si ricade sulla prima.
  $effect(() => {
    if (sel && !byId(sel)) sel = null
  })
  // Cambiando analisi si azzerano selezione e modifica.
  let lastId = ''
  $effect(() => {
    if (rca && rca.id !== lastId) {
      lastId = rca.id
      sel = null
      editing = null
      zoom = 1
    }
  })

  // ---- creazione / gestione delle analisi ----
  let creating = $state(false)
  let newKind = $state<Rca['kind']>('whys')
  let newTitle = $state('')
  let newTask = $state('')
  const openTasks = $derived(store.tasks.filter((t) => t.projectId === store.currentProjectId && !t.done))
  const taskOf = (id?: string) => (id ? store.tasks.find((t) => t.id === id) : undefined)

  function startNew() {
    creating = true
    newTitle = ''
    newTask = ''
  }
  // Scegliendo un task il titolo proposto e' il suo titolo.
  function pickTask() {
    const t = taskOf(newTask)
    if (t && !newTitle.trim()) newTitle = t.title
  }
  async function create() {
    const title = newTitle.trim() || 'Problem to investigate'
    const r = await store.addRca(newKind, title, newTask || undefined)
    store.setPref('rcaId', r.id)
    creating = false
  }
  async function removeAnalysis() {
    if (rca && confirm(`Delete the analysis “${rca.title}”?`)) await store.removeRca(rca.id)
  }

  // ---- modifica dei nodi ----
  const save = (next: RcaNode[]) => rca && store.updateRca(rca.id, { nodes: next })
  const patchNode = (id: string, p: Partial<RcaNode>) => save(nodes.map((n) => (n.id === id ? { ...n, ...p } : n)))

  function addNode(parentId: string, color?: string) {
    const n: RcaNode = { id: crypto.randomUUID(), parentId, text: '', ...(color ? { color } : {}) }
    void save([...nodes, n])
    sel = n.id
    startEdit(n.id)
  }
  const addChild = (id: string) => {
    const parent = byId(id)
    // Il colore del padre si eredita (tranne la radice) per riconoscere i rami.
    addNode(id, parent?.parentId === null ? undefined : parent?.color)
  }
  function addSibling(id: string) {
    const n = byId(id)
    if (n?.parentId) addNode(n.parentId, n.color)
  }
  function startEdit(id: string) {
    editing = id
    draft = byId(id)?.text ?? ''
  }
  function commit() {
    if (!editing) return
    const id = editing
    editing = null
    if (byId(id) && draft !== byId(id)!.text) void patchNode(id, { text: draft.trim() })
  }
  function remove(id: string) {
    const ids = subtreeIds(nodes, id)
    if (ids.length > 1 && !confirm(`Delete this and ${ids.length - 1} item(s) below it?`)) return
    void save(nodes.filter((n) => !ids.includes(n.id)))
    sel = null
  }
  const focusOnMount = (el: HTMLTextAreaElement) => {
    el.focus()
    el.select()
  }

  // Azione correttiva: crea un task dal nodo (titolo "Fix: …") e lo collega.
  async function toTask(n: RcaNode) {
    const label = n.text.trim() || 'cause'
    const t = await store.addTask(`Fix: ${label}`)
    await store.updateTask(t.id, { description: `<p>Corrective action from root cause analysis “${rca?.title ?? ''}”.</p>` })
    await patchNode(n.id, { taskId: t.id, cause: true })
  }
  const openTask = (id: string) => (store.openTaskId = id)

  // Da Is/Is-Not o Pareto: apre un nuovo 5 Perche' (stesso task) con il testo dato come problema.
  async function startWhys(title: string) {
    if (!rca) return
    const r = await store.addRca('whys', title.trim() || rca.title, rca.taskId)
    store.setPref('rcaId', r.id)
  }

  // Drag & drop: sposta un nodo (con il suo ramo) sotto un altro.
  let dragId = $state<string | null>(null)
  let over = $state<string | null>(null)
  const canDrop = (target: string) => !!dragId && !subtreeIds(nodes, dragId).includes(target) && byId(dragId)?.parentId !== target
  function drop(target: string) {
    if (dragId && canDrop(target)) void patchNode(dragId, { parentId: target })
    dragId = null
    over = null
  }

  function onKey(e: KeyboardEvent) {
    if (editing || !sel) return
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(sel) }
    else if (e.key === 'Tab') { e.preventDefault(); addChild(sel) }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (selNode?.parentId) { e.preventDefault(); remove(sel) } }
    else if (e.key === 'Escape') sel = null
  }
  function onEditKey(e: KeyboardEvent) {
    e.stopPropagation() // altrimenti il contenitore (onKey) rilegge Invio/Tab appena gestiti
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const id = editing!; commit(); (e.currentTarget as HTMLElement).blur(); sel = id }
    else if (e.key === 'Escape') { editing = null }
    else if (e.key === 'Tab') { e.preventDefault(); const id = editing!; commit(); addChild(id) }
  }

  // Esporta il diagramma (PNG, PDF o PowerPoint modificabile) con la stessa geometria mostrata a schermo.
  let exporting = $state(false)
  async function doExport(fmt: RcaFormat) {
    if (!rca) return
    exporting = true
    try { await exportRca(fmt, rca, lay, measure) } catch (e) { alert('Export failed: ' + (e instanceof Error ? e.message : e)) } finally { exporting = false }
  }

  // Zoom: pulsanti e "adatta" alla larghezza visibile.
  const setZoom = (z: number) => (zoom = Math.min(2, Math.max(0.3, Math.round(z * 100) / 100)))
  const fit = () => scroller && lay.width && setZoom((scroller.clientWidth - 8) / lay.width)

  const colorOf = (k?: string) => COLORS[k ?? 'gray'] ?? COLORS.gray
  const causes = $derived(nodes.filter((n) => n.cause))
  const ruledOut = $derived(nodes.filter((n) => n.out))
  const childLabel = (n: RcaNode) => (rca?.kind === 'fishbone' ? (n.parentId === null ? 'Category' : 'Cause') : rca?.kind === 'faulttree' ? 'Cause' : 'Why?')
</script>

<div class="tool-body rca">
  <div class="rca-bar">
    {#if store.rcaList.length}
      <select aria-label="Analysis" value={rca?.id} onchange={(e) => store.setPref('rcaId', e.currentTarget.value)}>
        {#each store.rcaList as r (r.id)}<option value={r.id}>{KINDS[r.kind].label} · {r.title}</option>{/each}
      </select>
    {/if}
    <button class="chip primary" onclick={startNew}>+ New analysis</button>
  </div>

  {#if creating}
    <div class="rca-new">
      <label>Type
        <select bind:value={newKind}>
          {#each Object.entries(KINDS) as [k, v] (k)}<option value={k}>{v.label}</option>{/each}
        </select>
      </label>
      <label>Investigates task <small class="muted">(optional)</small>
        <select bind:value={newTask} onchange={pickTask}>
          <option value="">— none —</option>
          {#each openTasks as t (t.id)}<option value={t.id}>{t.title}</option>{/each}
        </select>
      </label>
      <label class="grow">{newKind === 'whys' ? 'Problem' : 'Effect / problem'}
        <input placeholder="e.g. Customer reports arrive late" bind:value={newTitle} onkeydown={(e) => e.key === 'Enter' && create()} />
      </label>
      <span class="rca-new-btns">
        <button class="chip primary" onclick={create}>Create</button>
        <button class="chip" onclick={() => (creating = false)}>Cancel</button>
      </span>
    </div>
  {/if}

  {#if !rca}
    <p class="tool-desc">
      Find the <b>root cause</b> of a problem instead of fixing symptoms. Use <b>5 Whys</b> for a quick chain of causes, or a <b>Fishbone</b> diagram to explore causes by category.
      Link the analysis to a task, and turn the root causes into corrective-action tasks. Press <b>+ New analysis</b> to start.
    </p>
  {:else}
    <p class="tool-desc">{KINDS[rca.kind].hint}</p>

    <div class="rca-bar">
      <input class="rca-title" aria-label="Title" value={rca.title} onchange={(e) => store.updateRca(rca.id, { title: e.currentTarget.value.trim() || rca.title })} />
      <label class="rca-link">Task
        <select value={rca.taskId ?? ''} onchange={(e) => store.updateRca(rca.id, { taskId: e.currentTarget.value || null })}>
          <option value="">— not linked —</option>
          {#each openTasks as t (t.id)}<option value={t.id}>{t.title}</option>{/each}
          {#if rca.taskId && !openTasks.some((t) => t.id === rca.taskId) && taskOf(rca.taskId)}<option value={rca.taskId}>{taskOf(rca.taskId)?.title}</option>{/if}
        </select>
      </label>
      {#if taskOf(rca.taskId)}<button class="chip" onclick={() => openTask(rca.taskId!)}>Open task</button>{/if}
      <span class="spacer"></span>
      {#if isTree}<span class="rca-zoom">
        <button class="chip" aria-label="Zoom out" onclick={() => setZoom(zoom - 0.1)}>−</button>
        <button class="chip" title="Reset zoom" onclick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button class="chip" aria-label="Zoom in" onclick={() => setZoom(zoom + 0.1)}>+</button>
        <button class="chip" onclick={fit}>Fit</button>
      </span>{/if}
      <span class="rca-zoom" title="Export the diagram">
        <button class="chip" disabled={exporting} onclick={() => doExport('png')}>PNG</button>
        <button class="chip" disabled={exporting} onclick={() => doExport('pdf')}>PDF</button>
        {#if isTree}<button class="chip" disabled={exporting} title="Editable PowerPoint slide" onclick={() => doExport('pptx')}>PowerPoint</button>{/if}
      </span>
      <button class="chip danger" onclick={removeAnalysis}>Delete</button>
    </div>

    {#if rca.kind === 'isnot'}
      <RcaIsNot {rca} onwhys={() => startWhys(rca.title)} />
    {:else if rca.kind === 'pareto'}
      <RcaPareto {rca} onwhys={startWhys} />
    {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
    <div class="rca-scroll" bind:this={scroller} tabindex="0" onkeydown={onKey} onclick={() => (sel = null)}>
      <div class="rca-stage" style:width="{lay.width * zoom}px" style:height="{lay.height * zoom + 110}px">
        <div class="rca-inner" style:width="{lay.width}px" style:height="{lay.height}px" style:transform="scale({zoom})">
          <svg width={lay.width} height={lay.height} aria-hidden="true">
            {#each lay.lines as l, i (i)}
              <path d={l.d} class="rca-line" class:dashed={l.dashed} class:bold={l.bold} class:out={l.out} class:hot={l.hot} />
              {#if l.cross}<text x={l.cross.x} y={l.cross.y} class="rca-cross" text-anchor="middle" dominant-baseline="central">✕</text>{/if}
            {/each}
          </svg>
          {#each lay.boxes as b (b.id)}
            {#if b.role === 'gate'}
              <button class="rca-gate {b.lines[0].toLowerCase()}" class:out={b.out} style:left="{b.x}px" style:top="{b.y}px" style:width="{b.w}px" style:height="{b.h}px"
                title="Click to switch AND / OR" onclick={(e) => { e.stopPropagation(); const id = b.id.slice(5); void patchNode(id, { gate: byId(id)?.gate === 'and' ? 'or' : 'and' }) }}>{b.lines[0]}</button>
            {:else}
            {@const n = byId(b.id)}
            {@const c = colorOf(b.color)}
            {@const task = taskOf(n?.taskId)}
            {#if b.label}<span class="rca-label" style:left="{b.x}px" style:top="{b.y - 15}px">{b.label}</span>{/if}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div
              class="rca-box {b.role}"
              class:sel={sel === b.id}
              class:cause={b.cause}
              class:out={b.out}
              class:over={over === b.id}
              style:left="{b.x}px" style:top="{b.y}px" style:width="{b.w}px" style:height="{b.h}px"
              style:background={c.bg} style:color={c.fg}
              draggable={b.role !== 'root' && editing !== b.id}
              onclick={(e) => { e.stopPropagation(); sel = b.id }}
              ondblclick={(e) => { e.stopPropagation(); sel = b.id; startEdit(b.id) }}
              ondragstart={(e) => { dragId = b.id; e.dataTransfer?.setData('text/plain', b.id) }}
              ondragend={() => { dragId = null; over = null }}
              ondragover={(e) => { if (canDrop(b.id)) { e.preventDefault(); over = b.id } }}
              ondragleave={() => { if (over === b.id) over = null }}
              ondrop={(e) => { e.preventDefault(); drop(b.id) }}
            >
              {#if editing === b.id}
                <textarea use:focusOnMount bind:value={draft} onblur={commit} onkeydown={onEditKey} onclick={(e) => e.stopPropagation()} aria-label="Text"></textarea>
              {:else if n && !n.text}
                <div class="ph">{b.role === 'cat' ? 'Category' : b.role === 'root' ? 'Problem' : 'Type here…'}</div>
              {:else}
                {#each b.lines as ln, i (i)}<div>{ln}</div>{/each}
              {/if}
              {#if b.cause}<span class="rca-star" title="Root cause">★</span>{/if}
              {#if task}<span class="rca-done" title={task.done ? 'Action done' : 'Action open'}>{task.done ? '✔' : '☐'}</span>{/if}
              {#if n?.out}<span class="rca-x" title="Ruled out">✕</span>{/if}
            </div>
            {/if}
          {/each}

          {#if selBox && selNode && !editing}
            <div class="rca-actions" style:left="{selBox.x}px" style:top="{selBox.y + selBox.h + 6}px"
              onclick={(e) => e.stopPropagation()} role="toolbar" tabindex="-1" onkeydown={(e) => e.stopPropagation()}>
              <button class="chip" title="Add below (Tab)" onclick={() => addChild(selNode.id)}>＋ {childLabel(selNode)}</button>
              {#if selNode.parentId}
                <button class="chip" title="Add next to it" onclick={() => addSibling(selNode.id)}>＋ Sibling</button>
              {/if}
              <button class="chip" title="Edit (Enter)" onclick={() => startEdit(selNode.id)}>✎</button>
              {#if selNode.parentId}
                <button class="chip" class:active={selNode.cause} title="Mark as root cause" onclick={() => patchNode(selNode.id, { cause: !selNode.cause, ...(!selNode.cause ? { out: false } : {}) })}>★</button>
                <button class="chip" class:active={selNode.out} title="Rule out: this branch led nowhere (hypothesis disproved)" onclick={() => patchNode(selNode.id, { out: !selNode.out, ...(!selNode.out ? { cause: false } : {}) })}>✕ Ruled out</button>
              {/if}
              {#if taskOf(selNode.taskId)}
                <button class="chip" onclick={() => openTask(selNode.taskId!)}>Open task</button>
              {:else if selNode.parentId}
                <button class="chip" title="Create a corrective-action task" onclick={() => toTask(selNode)}>→ To-do</button>
              {/if}
              <span class="rca-sw">
                {#each COLOR_KEYS as k (k)}
                  <button class="sw" class:on={selNode.color === k} style:background={COLORS[k].bg} aria-label={k} onclick={() => patchNode(selNode.id, { color: k })}></button>
                {/each}
              </span>
              {#if selNode.parentId}<button class="chip danger" aria-label="Delete" onclick={() => remove(selNode.id)}>🗑</button>{/if}
            </div>
          {/if}
        </div>
      </div>
    </div>

    {/if}

    {#if isTree}
    <p class="rca-legend"><i class="lg hot"></i> path to a root cause <i class="lg out"></i> ruled out (dead end) · {ruledOut.length} branch{ruledOut.length === 1 ? '' : 'es'} ruled out</p>

    <div class="rca-plan">
      <h3>Action plan <small class="muted">— nodes marked ★ as root cause</small></h3>
      {#each causes as n (n.id)}
        {@const t = taskOf(n.taskId)}
        <div class="rca-plan-row">
          <span class="rca-plan-text">★ {n.text || '(empty)'}</span>
          {#if t}
            <button class="chip" class:active={t.done} onclick={() => openTask(t.id)}>{t.done ? '✔' : '☐'} {t.title}</button>
          {:else}
            <button class="chip primary" onclick={() => toTask(n)}>→ To-do</button>
          {/if}
        </div>
      {:else}
        <p class="muted">No root cause marked yet. Select a node and press ★.</p>
      {/each}
    </div>
    {/if}
  {/if}
</div>
