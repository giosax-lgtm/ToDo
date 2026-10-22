<!--
  VISTA DASHBOARD: avanzamento complessivo della lista in numeri e percentuali (completati, da fare, in ritardo, in scadenza), ripartizione per stato,
  scadenze, priorita' e per gruppo (raggruppamento della vista), piu' l'elenco dei task in ritardo e in arrivo.
  Rispetta filtri e ricerca della vista ma include sempre i completati (altrimenti le percentuali non avrebbero senso).
  Click su un task = apre CardDetail. Montata da App.svelte quando la vista ha layout 'dashboard'.
-->

<script lang="ts">
  import { store, today, dueBucket, daysBetween } from './store.svelte'
  import { COLORS } from './colors'
  import type { Task } from './types'

  const pct = (n: number, tot: number) => (tot ? Math.round((n / tot) * 100) : 0)
  const tasks = $derived(store.tasks.filter((t) => store.matches(t, true)))
  const open = $derived(tasks.filter((t) => !t.done))
  const done = $derived(tasks.length - open.length)

  const overdue = $derived(open.filter((t) => dueBucket(t) === 'overdue'))
  const dueToday = $derived(open.filter((t) => dueBucket(t) === 'today'))
  const dueWeek = $derived(open.filter((t) => dueBucket(t) === 'week'))
  const later = $derived(open.filter((t) => dueBucket(t) === 'later'))
  const noDate = $derived(open.filter((t) => dueBucket(t) === 'none'))
  const withDue = $derived(tasks.filter((t) => t.due))

  // Ripartizione per stato (colonne della lista) con conteggio e percentuale.
  const byStatus = $derived(
    store.projectColumns.map((c) => {
      const n = tasks.filter((t) => t.columnId === c.id).length
      return { label: c.name, color: c.color, n, p: pct(n, tasks.length) }
    }),
  )
  // Ripartizione per priorita' (solo task aperti).
  const byPriority = $derived(
    [5, 4, 3, 2, 1, 0].map((p) => {
      const n = open.filter((t) => t.priority === p).length
      return { label: p ? '★'.repeat(p) : 'No priority', n, p: pct(n, open.length) }
    }),
  )
  // Per gruppo (secondo il raggruppamento della vista): totale, completati, in ritardo.
  const byGroup = $derived(
    store.draft.groupBy === 'none'
      ? []
      : store.groups
          .map((g) => {
            const m = tasks.filter((t) => store.groupKeys(t).includes(g.key))
            return { label: g.label, color: g.color, total: m.length, done: m.filter((t) => t.done).length, late: m.filter((t) => !t.done && dueBucket(t) === 'overdue').length }
          })
          .filter((g) => g.total),
  )
  // Avanzamento dei passi dei task con tracciamento.
  const steps = $derived.by(() => {
    const ids = new Set(tasks.filter((t) => t.track).map((t) => t.id))
    const s = store.steps.filter((x) => ids.has(x.taskId))
    return { total: s.length, done: s.filter((x) => x.status === 'done').length, waiting: s.filter((x) => x.status === 'waiting').length, late: s.filter((x) => x.status !== 'done' && x.due && x.due < today()).length }
  })

  // Carico per responsabile (campo "Assignee"): task aperti, quanti in ritardo e giorni pianificati ancora da lavorare.
  const workload = $derived.by(() => {
    const f = store.peopleField()
    if (!f) return []
    const rows = store.fieldOptions(f.id).map((o) => {
      const mine = tasks.filter((t) => (t.tags[f.id] ?? []).includes(o.id))
      const op = mine.filter((t) => !t.done)
      return { label: o.label, color: o.color, open: op.length, done: mine.length - op.length, late: op.filter((t) => dueBucket(t) === 'overdue').length, days: op.reduce((n, t) => n + (t.milestone ? 0 : t.due ? Math.max(1, daysBetween(t.start && t.start <= t.due ? t.start : t.due, t.due) + 1) : t.est ?? 0), 0) }
    }).filter((r) => r.open + r.done)
    const none = open.filter((t) => !(t.tags[f.id] ?? []).length).length
    if (none) rows.push({ label: 'Unassigned', color: 'gray', open: none, done: 0, late: open.filter((t) => !(t.tags[f.id] ?? []).length && dueBucket(t) === 'overdue').length, days: 0 })
    return rows
  })
  const maxOpen = $derived(Math.max(1, ...workload.map((w) => w.open)))

  // Stime contro realta': giorni stimati, pianificati (inizio -> scadenza) e reali (inizio -> completamento) dei task con stima.
  const est = $derived.by(() => {
    const m = tasks.filter((t) => t.est && !t.milestone)
    const planned = (t: Task) => (t.due ? daysBetween(store.startOf(t), t.due) + 1 : 0)
    const fin = m.filter((t) => t.done && t.doneAt)
    return {
      n: m.length,
      est: m.reduce((n, t) => n + t.est!, 0),
      overPlan: m.filter((t) => !t.done && planned(t) > t.est!).length,
      finN: fin.length,
      finEst: fin.reduce((n, t) => n + t.est!, 0),
      finAct: fin.reduce((n, t) => n + daysBetween(store.startOf(t), t.doneAt!) + 1, 0),
      overAct: fin.filter((t) => daysBetween(store.startOf(t), t.doneAt!) + 1 > t.est!).length,
    }
  })
  // Baseline: quanti task sono slittati rispetto al piano congelato.
  const base = $derived.by(() => {
    const m = tasks.filter((t) => t.baseline && t.due)
    const slips = m.map((t) => daysBetween(t.baseline!.due, t.due!))
    return { n: m.length, late: slips.filter((x) => x > 0).length, early: slips.filter((x) => x < 0).length, worst: Math.max(0, ...slips) }
  })

  const byDue = (a: Task, b: Task) => (a.due ?? '').localeCompare(b.due ?? '')
  const lateList = $derived([...overdue].sort(byDue).slice(0, 8))
  const soonList = $derived([...dueToday, ...dueWeek].sort(byDue).slice(0, 8))
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today())) / 86400000)
  const when = (d: string) => { const n = days(d); return n === 0 ? 'today' : n < 0 ? `${-n}d late` : `in ${n}d` }
</script>

{#snippet bar(n: number, tot: number, color: string)}
  <div class="d-track"><span class="d-fill" style:width="{pct(n, tot)}%" style:background={color}></span></div>
{/snippet}

{#snippet list(items: Task[])}
  {#each items as t (t.id)}
    <button class="d-task" onclick={() => (store.openTaskId = t.id)}>
      <span class="d-title">{t.title}</span>
      <span class="d-when" class:overdue={dueBucket(t) === 'overdue'}>{t.due} · {when(t.due!)}</span>
    </button>
  {:else}<span class="muted">Nothing here</span>{/each}
{/snippet}

<div class="dash">
  {#if !tasks.length}
    <p class="muted">No tasks in this view yet.</p>
  {:else}
    <section class="d-card d-hero">
      <div class="d-big">{pct(done, tasks.length)}<small>%</small></div>
      <div class="d-herotxt">
        <b>Overall progress</b>
        <span class="muted">{done} of {tasks.length} tasks completed</span>
        <div class="d-track lg"><span class="d-fill" style:width="{pct(done, tasks.length)}%" style:background="#2e9e4f"></span></div>
      </div>
    </section>

    <div class="d-kpis">
      <div class="d-kpi"><b>{tasks.length}</b><span>Total</span></div>
      <div class="d-kpi ok"><b>{done}</b><span>Completed · {pct(done, tasks.length)}%</span></div>
      <div class="d-kpi"><b>{open.length}</b><span>To do · {pct(open.length, tasks.length)}%</span></div>
      <div class="d-kpi bad"><b>{overdue.length}</b><span>Overdue{open.length ? ` · ${pct(overdue.length, open.length)}% of open` : ''}</span></div>
      <div class="d-kpi warn"><b>{dueToday.length + dueWeek.length}</b><span>Due in 7 days</span></div>
      <div class="d-kpi"><b>{noDate.length}</b><span>No due date</span></div>
    </div>

    <div class="d-grid">
      <section class="d-card">
        <h3>By status</h3>
        {#each byStatus as s (s.label)}
          <div class="d-line"><span>{s.label}</span><b>{s.n}</b><small>{s.p}%</small></div>
          {@render bar(s.n, tasks.length, COLORS[s.color]?.fg ?? '#1264a3')}
        {/each}
      </section>

      <section class="d-card">
        <h3>Deadlines <small class="muted">open tasks</small></h3>
        {#each [['Overdue', overdue.length, '#c0392b'], ['Today', dueToday.length, '#d68910'], ['Next 7 days', dueWeek.length, '#1264a3'], ['Later', later.length, '#7f8c8d'], ['No due date', noDate.length, '#b2b2b2']] as [label, n, color] (label)}
          <div class="d-line"><span>{label}</span><b>{n}</b><small>{pct(n as number, open.length)}%</small></div>
          {@render bar(n as number, open.length, color as string)}
        {/each}
        {#if withDue.length}
          <p class="muted d-note">{withDue.length} tasks have a due date · {pct(withDue.filter((t) => t.done).length, withDue.length)}% of them completed</p>
        {/if}
      </section>

      <section class="d-card">
        <h3>Priority <small class="muted">open tasks</small></h3>
        {#each byPriority as s (s.label)}
          <div class="d-line"><span>{s.label}</span><b>{s.n}</b><small>{s.p}%</small></div>
          {@render bar(s.n, open.length, '#7a5cc4')}
        {/each}
      </section>

      {#if byGroup.length}
        <section class="d-card">
          <h3>By {store.filterLabel(store.draft.groupBy)}</h3>
          {#each byGroup as g (g.label)}
            <div class="d-line"><span>{g.label}</span><b>{g.done}/{g.total}</b><small>{pct(g.done, g.total)}%{g.late ? ` · ${g.late} late` : ''}</small></div>
            {@render bar(g.done, g.total, COLORS[g.color]?.fg ?? '#2e9e4f')}
          {/each}
        </section>
      {/if}

      {#if steps.total}
        <section class="d-card">
          <h3>Tracked steps</h3>
          <div class="d-line"><span>Done</span><b>{steps.done}/{steps.total}</b><small>{pct(steps.done, steps.total)}%</small></div>
          {@render bar(steps.done, steps.total, '#2e9e4f')}
          <p class="muted d-note">{steps.waiting} waiting for someone · {steps.late} past due</p>
        </section>
      {/if}

      {#if workload.length}
        <section class="d-card">
          <h3>Workload by assignee <small class="muted">open tasks</small></h3>
          {#each workload as w (w.label)}
            <div class="d-line"><span>{w.label}</span><b>{w.open}</b><small>{w.days ? `${w.days}d` : ''}{w.late ? ` · ${w.late} late` : ''}</small></div>
            {@render bar(w.open, maxOpen, COLORS[w.color]?.fg ?? '#1264a3')}
          {/each}
        </section>
      {/if}

      {#if est.n}
        <section class="d-card">
          <h3>Estimate vs actual</h3>
          <div class="d-line"><span>Tasks with an estimate</span><b>{est.n}</b><small>{est.est}d total</small></div>
          <div class="d-line"><span>Open, planned longer than estimate</span><b class:overdue={est.overPlan > 0}>{est.overPlan}</b></div>
          {#if est.finN}
            <div class="d-line"><span>Completed: estimated vs actual</span><b>{est.finEst}d / {est.finAct}d</b><small>{est.finEst ? Math.round((est.finAct / est.finEst) * 100) : 0}%</small></div>
            <div class="d-line"><span>Completed over estimate</span><b class:overdue={est.overAct > 0}>{est.overAct}/{est.finN}</b></div>
          {/if}
        </section>
      {/if}

      {#if base.n}
        <section class="d-card">
          <h3>Against baseline</h3>
          <div class="d-line"><span>Slipped (later than planned)</span><b class:overdue={base.late > 0}>{base.late}</b><small>{pct(base.late, base.n)}%</small></div>
          {@render bar(base.late, base.n, '#c0392b')}
          <div class="d-line"><span>Ahead of plan</span><b>{base.early}</b><small>{pct(base.early, base.n)}%</small></div>
          <div class="d-line"><span>On plan</span><b>{base.n - base.late - base.early}</b></div>
          {#if base.worst}<p class="muted d-note">Worst slip: {base.worst} days</p>{/if}
        </section>
      {/if}

      <section class="d-card">
        <h3>Overdue</h3>
        {@render list(lateList)}
        {#if overdue.length > lateList.length}<span class="muted d-note">+ {overdue.length - lateList.length} more</span>{/if}
      </section>

      <section class="d-card">
        <h3>Coming up</h3>
        {@render list(soonList)}
      </section>
    </div>
  {/if}
</div>
