<!--
  TRACCIAMENTO di un task (sostituisce l'elenco dei sotto-task quando Task.track e' attivo). Due schede:
  'Steps' = passi con stato (da fare / in corso / in attesa / fatto), scadenza facoltativa e "aspetto chi", con barra di avanzamento a segmenti;
  'Activity' = diario cronologico (voci automatiche + commenti scritti dall'utente). Dati e logica in store.svelte.ts (steps, logs, addStep, updateStep, addNote...).
  Montato da CardDetail.svelte. Stili: sezione "tracking" di app.css (prefisso trk-).
-->

<script lang="ts">
  import { store, toLocalInput } from './store.svelte'
  import Linkify from './Linkify.svelte'
  import Comments from './Comments.svelte'
  import { sortable } from './sortable'
  import type { StepStatus, Task } from './types'

  let { task }: { task: Task } = $props()

  const STATUSES: { key: StepStatus; label: string; icon: string }[] = [
    { key: 'todo', label: 'To do', icon: '' },
    { key: 'doing', label: 'In progress', icon: '◐' },
    { key: 'waiting', label: 'Waiting', icon: '⏳' },
    { key: 'done', label: 'Done', icon: '✓' },
  ]
  const meta = (s: StepStatus) => STATUSES.find((x) => x.key === s)!

  let tab = $state<'steps' | 'log'>('steps')
  let newStep = $state('')
  let newNote = $state('')
  let openId = $state<string | null>(null) // passo con l'editor aperto
  let showDone = $state(false)
  let dayOpen = $state<Record<string, boolean>>({}) // giorni del diario aperti/chiusi; di default solo il piu' recente e' aperto
  let cmOpen = $state<Record<string, boolean>>({}) // passi con i commenti espansi (di default ridotti all'icona col numero)

  // Riordino dopo un trascinamento dentro un gruppo (Now / To do / Done): sposta 'id' alla posizione 'index' tra i passi di quel gruppo.
  function reorder(list: typeof steps) {
    return (id: string, _to: HTMLElement, index: number) => {
      const ids = list.map((s) => s.id).filter((x) => x !== id)
      ids.splice(index, 0, id)
      void store.reorderSteps(ids)
    }
  }

  const steps = $derived(store.stepsOf(task.id))
  const stats = $derived(store.stepStats(task.id))
  const logs = $derived(store.logsOf(task.id))
  const active = $derived(steps.filter((s) => s.status === 'doing' || s.status === 'waiting'))
  const todo = $derived(steps.filter((s) => s.status === 'todo'))
  const done = $derived(steps.filter((s) => s.status === 'done'))

  // "3d" / "today" da un istante a oggi.
  function age(ms: number) {
    const d = Math.floor((Date.now() - ms) / 86400000)
    return d <= 0 ? 'today' : `${d}d`
  }
  // "5 min ago", "2 h ago", "3 d ago" per l'ultima attivita'.
  function ago(ms: number) {
    const m = Math.floor((Date.now() - ms) / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m} min ago`
    if (m < 1440) return `${Math.floor(m / 60)} h ago`
    return `${Math.floor(m / 1440)} d ago`
  }
  const dayKey = (ms: number) => new Date(ms).toDateString()
  function dayLabel(ms: number) {
    if (dayKey(ms) === dayKey(Date.now())) return 'Today'
    if (dayKey(ms) === dayKey(Date.now() - 86400000)) return 'Yesterday'
    return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }
  const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const shortDay = (d: string) => new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const isOverdue = (d: string | null, st: StepStatus) => !!d && st !== 'done' && d < new Date().toISOString().slice(0, 10)

  // Diario raggruppato per giorno, dal piu' recente.
  const grouped = $derived.by(() => {
    const out: { label: string; items: typeof logs }[] = []
    for (const l of logs) {
      const label = dayLabel(l.at)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(l)
      else out.push({ label, items: [l] })
    }
    return out
  })

  function addStep() {
    if (!newStep.trim()) return
    void store.addStep(task.id, newStep)
    newStep = ''
  }
  function addNote() {
    if (!newNote.trim()) return
    void store.addNote(task.id, newNote)
    newNote = ''
  }
  // Scorciatoie del promemoria: tra N ore; tra N giorni alle 9:00.
  const inHours = (h: number) => new Date(Date.now() + h * 3600000)
  function atNine(days: number) { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); return d }
  // Tocco sul cerchio: fatto <-> da fare.
  const toggle = (id: string, st: StepStatus) => store.updateStep(id, { status: st === 'done' ? 'todo' : 'done' })
  function stop() {
    if (confirm('Stop tracking? Steps go back to plain subtasks (done / not done); their status, dates and reminders are lost. The activity log is kept.')) void store.disableTracking(task.id)
  }
</script>

{#snippet row(s: (typeof steps)[number])}
  <div class="trk-step" class:open={openId === s.id} class:done={s.status === 'done'} data-id={s.id}>
    <div class="trk-main">
      <i class="drag-h" aria-hidden="true" title="Drag to reorder">⋮⋮</i>
      <button class="trk-dot {s.status}" aria-label="Toggle done" onclick={() => toggle(s.id, s.status)}>{meta(s.status).icon}</button>
      <button class="trk-text" onclick={() => (openId = openId === s.id ? null : s.id)}>
        <span class="trk-title"><Linkify text={s.text} /></span>
        {#if s.status === 'waiting' || s.status === 'doing' || s.due || (s.reminder && !s.reminder.fired && s.status !== 'done')}
          <span class="trk-sub">
            {#if s.status === 'waiting'}<span class="trk-tag waiting">Waiting{s.waitingFor ? ` for ${s.waitingFor}` : ''} · {age(s.statusAt)}</span>{/if}
            {#if s.status === 'doing'}<span class="trk-tag doing">In progress</span>{/if}
            {#if s.reminder && !s.reminder.fired && s.status !== 'done'}<span class="trk-tag">🔔 {s.reminder.at.slice(5, 10).split('-').reverse().join('/')} {s.reminder.at.slice(11)}</span>{/if}
            {#if s.due}<span class="trk-tag" class:late={isOverdue(s.due, s.status)}>📅 {shortDay(s.due)}</span>{/if}
          </span>
        {/if}
      </button>
      <button class="sub-cm" class:has={!!s.comments?.length} aria-label="Comments" aria-expanded={!!cmOpen[s.id]} title="Comments"
        onclick={() => (cmOpen[s.id] = !cmOpen[s.id])}>💬{s.comments?.length ? ` ${s.comments.length}` : ''}</button>
    </div>
    {#if cmOpen[s.id]}
      <div class="trk-cm">
        <Comments comments={s.comments} onadd={(t) => store.addStepComment(s.id, t)} ondelete={(c) => store.deleteStepComment(s.id, c)} />
      </div>
    {/if}
    {#if openId === s.id}
      <div class="trk-edit">
        <div class="trk-seg" role="group" aria-label="Step status">
          {#each STATUSES as st (st.key)}
            <button class={st.key} class:on={s.status === st.key} onclick={() => store.updateStep(s.id, { status: st.key })}>{st.label}</button>
          {/each}
        </div>
        {#if s.status === 'waiting'}
          <input class="trk-in" placeholder="Waiting for… (e.g. Rossi)" value={s.waitingFor} onchange={(e) => store.updateStep(s.id, { waitingFor: e.currentTarget.value.trim() })} />
        {/if}
        <div class="trk-edit-row">
          <input class="trk-in" type="date" aria-label="Date" value={s.due ?? ''} onchange={(e) => store.updateStep(s.id, { due: e.currentTarget.value || null })} />
          {#if s.due}<button class="trk-link" onclick={() => store.updateStep(s.id, { due: null })}>Clear date</button>{/if}
        </div>
        <div class="trk-rem">
          <span class="trk-rem-k">🔔 Reminder</span>
          {#if s.reminder}
            <div class="trk-edit-row">
              <input class="trk-in" type="datetime-local" aria-label="Reminder" value={s.reminder.at}
                onchange={(e) => e.currentTarget.value && store.setStepReminder(s.id, e.currentTarget.value)} />
              <button class="trk-link" onclick={() => store.setStepReminder(s.id, null)}>Remove</button>
            </div>
            {#if s.reminder.fired}<small class="muted">Already shown. Change the time to set it again.</small>{/if}
          {:else}
            <div class="trk-presets">
              <button class="chip" onclick={() => store.setStepReminder(s.id, toLocalInput(inHours(1)))}>In 1 hour</button>
              <button class="chip" onclick={() => store.setStepReminder(s.id, toLocalInput(atNine(1)))}>Tomorrow 9:00</button>
              <button class="chip" onclick={() => store.setStepReminder(s.id, toLocalInput(atNine(3)))}>In 3 days</button>
              <button class="chip" onclick={() => store.setStepReminder(s.id, toLocalInput(atNine(7)))}>In 1 week</button>
            </div>
          {/if}
        </div>
        <input class="trk-in" aria-label="Step text" value={s.text} onchange={(e) => store.updateStep(s.id, { text: e.currentTarget.value.trim() || s.text })} />
        <button class="trk-link danger" onclick={() => store.deleteStep(s.id)}>Delete step</button>
      </div>
    {/if}
  </div>
{/snippet}

<div class="block trk">
  <div class="trk-head">
    <span class="lbl">Progress</span>
    <span class="trk-pct">{stats.pct}%</span>
  </div>
  <div class="trk-bar" aria-label="Progress {stats.pct}%">
    {#each steps as s (s.id)}<span class="seg {s.status}"></span>{/each}
  </div>
  <div class="trk-counts">
    <span>{stats.done}/{stats.total} done</span>
    {#if stats.doing}<span class="doing">{stats.doing} in progress</span>{/if}
    {#if stats.waiting}<span class="waiting">{stats.waiting} waiting</span>{/if}
    {#if stats.todo}<span>{stats.todo} to do</span>{/if}
  </div>

  <div class="trk-tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'steps'} class:on={tab === 'steps'} onclick={() => (tab = 'steps')}>Steps</button>
    <button role="tab" aria-selected={tab === 'log'} class:on={tab === 'log'} onclick={() => (tab = 'log')}>Activity{logs.length ? ` · ${logs.length}` : ''}</button>
  </div>

  {#if tab === 'steps'}
    <input class="trk-in" placeholder="Add step, Enter" bind:value={newStep} onkeydown={(e) => e.key === 'Enter' && addStep()} />
    {#if active.length}
      <div class="trk-group-title">Now</div>
      <div class="trk-list" use:sortable={{ item: '.trk-step', group: 'trk-active', handle: '.drag-h', onMove: reorder(active) }}>
        {#each active as s (s.id)}{@render row(s)}{/each}
      </div>
    {/if}
    {#if todo.length}
      <div class="trk-group-title">To do</div>
      <div class="trk-list" use:sortable={{ item: '.trk-step', group: 'trk-todo', handle: '.drag-h', onMove: reorder(todo) }}>
        {#each todo as s (s.id)}{@render row(s)}{/each}
      </div>
    {/if}
    {#if done.length}
      <button class="trk-group-title toggle" onclick={() => (showDone = !showDone)}>{showDone ? '▾' : '▸'} Done · {done.length}</button>
      {#if showDone}
        <div class="trk-list" use:sortable={{ item: '.trk-step', group: 'trk-done', handle: '.drag-h', onMove: reorder(done) }}>
          {#each done as s (s.id)}{@render row(s)}{/each}
        </div>
      {/if}
    {/if}
    {#if !steps.length}<p class="trk-empty">No steps yet. Add the first one above.</p>{/if}
    {#if logs.length}
      <button class="trk-last" onclick={() => (tab = 'log')}>
        <span class="trk-last-k">Last activity · {ago(logs[0].at)}</span>
        <span class="trk-last-t">{logs[0].text}</span>
      </button>
    {/if}
  {:else}
    <input class="trk-in" placeholder="What did you do? Write a note, Enter" bind:value={newNote} onkeydown={(e) => e.key === 'Enter' && addNote()} />
    {#each grouped as g, i (g.label)}
      {@const open = dayOpen[g.label] ?? i === 0}
      {@const notes = g.items.filter((l) => l.kind === 'note').length}
      <button class="trk-day" aria-expanded={open} onclick={() => (dayOpen[g.label] = !open)}>
        <span>{open ? '▾' : '▸'} {g.label}</span>
        <small>{g.items.length} {g.items.length === 1 ? 'entry' : 'entries'}{notes ? ` · ${notes} 📝` : ''}</small>
      </button>
      {#if open}
      <ul class="trk-log">
        {#each g.items as l (l.id)}
          <li class={l.kind}>
            <span class="trk-time">{timeOf(l.at)}</span>
            <span class="trk-msg"><Linkify text={l.text} /></span>
            {#if l.kind === 'note'}<button class="trk-x" aria-label="Delete note" onclick={() => store.deleteLog(l.id)}>✕</button>{/if}
          </li>
        {/each}
      </ul>
      {/if}
    {/each}
    {#if grouped.length > 1}
      <button class="trk-link" onclick={() => { const all = grouped.every((g, i) => dayOpen[g.label] ?? i === 0); grouped.forEach((g) => (dayOpen[g.label] = !all)) }}>
        {grouped.every((g, i) => dayOpen[g.label] ?? i === 0) ? 'Collapse all days' : 'Expand all days'}
      </button>
    {/if}
    {#if !logs.length}<p class="trk-empty">Nothing yet. Changes are recorded here automatically.</p>{/if}
  {/if}

  <button class="trk-link stop" onclick={stop}>Stop tracking</button>
</div>
