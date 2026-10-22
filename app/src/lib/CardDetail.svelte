<!--
  PANNELLO DI DETTAGLIO di un task (si apre a destra sopra il board/tabella, ridimensionabile con resizer.ts). Modifica ogni proprieta' tramite store.updateTask():
  titolo, stato, priorita' (stelle), scadenza, reminder (Reminders.svelte), descrizione, sottotask (o, con il tracciamento attivo, passi + diario: Tracker.svelte), tag (TagPicker.svelte), creazione di nuovi campi tag, eliminazione.
  Montato da App.svelte quando store.openTask esiste (aperto da Card, TableView, Alerts o dopo la creazione di un task). Si chiude solo con il pulsante X.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { resizer } from './resizer'
  import { sortable } from './sortable'
  import TagPicker from './TagPicker.svelte'
  import Reminders from './Reminders.svelte'
  import Tracker from './Tracker.svelte'
  import Linkify from './Linkify.svelte'
  import Comments from './Comments.svelte'
  import RichText from './RichText.svelte'
  import type { Subtask, Task } from './types'

  let { task }: { task: Task } = $props()

  // Testo digitato per un nuovo sottotask e per un nuovo campo tag.
  let newSub = $state('')
  let newField = $state('')
  let openSub = $state<string | null>(null) // sotto-task con i commenti aperti

  // Scorciatoia: applica una modifica parziale al task aperto (store.updateTask).
  const patch = (p: Partial<Task>) => store.updateTask(task.id, p)

  // Adatta l'altezza della textarea al contenuto (ricalcolata a ogni digitazione e al cambio del testo).
  function autogrow(node: HTMLTextAreaElement, _text?: string) {
    const fit = () => { node.style.height = 'auto'; node.style.height = `${node.scrollHeight + 2}px` }
    fit()
    node.addEventListener('input', fit)
    const ro = new ResizeObserver(fit)
    ro.observe(node.parentElement ?? node)
    return { update: fit, destroy() { node.removeEventListener('input', fit); ro.disconnect() } }
  }

  // Aggiunge un sottotask con il testo digitato (Invio nel campo).
  function addSub() {
    const text = newSub.trim()
    if (!text) return
    patch({ subtasks: [...task.subtasks, { id: crypto.randomUUID(), text, done: false }] })
    newSub = ''
  }

  // Modifica un sottotask (spunta/rimuovi 'fatto') sostituendolo nell'elenco del task.
  function setSub(id: string, p: Partial<Subtask>) {
    patch({ subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  }

  // Riordino dei sotto-task dopo un trascinamento (sortable.ts): sposta il sotto-task 'id' alla posizione 'index'.
  function moveSub(id: string, _to: HTMLElement, index: number) {
    const list = task.subtasks.filter((s) => s.id !== id)
    const moved = task.subtasks.find((s) => s.id === id)
    if (!moved) return
    list.splice(index, 0, moved)
    patch({ subtasks: list })
  }

  // Predecessori scelti e candidati (task della lista, esclusi se stesso, quelli gia' scelti e quelli che dipendono da questo: eviterebbero un ciclo).
  const deps = $derived((task.deps ?? []).map((id) => store.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t))
  const depChoices = $derived.by(() => {
    const bad = store.descendantsOf(task.id)
    return store.tasks.filter((t) => t.projectId === task.projectId && t.id !== task.id && !bad.has(t.id) && !(task.deps ?? []).includes(t.id))
  })

  const subDone = $derived(task.subtasks.filter((s) => s.done).length)
  const subProgress = $derived(task.subtasks.length ? Math.round((subDone / task.subtasks.length) * 100) : 0)

  // Pannello a tutto schermo (preferenza 'detailMax', ricordata): pulsante ⤢ nell'intestazione, visibile solo su schermi larghi (su telefono il pannello e' gia' a tutta larghezza).
  const maxed = $derived(store.pref('detailMax', false))

  // Chiude il pannello (store.openTaskId = null): solo con il pulsante X (non con Esc o click fuori, che chiudevano il pannello a fine selezione del testo col mouse).
  function close() { store.openTaskId = null }
</script>

<div class="overlay" role="presentation">
  <div class="detail" role="dialog" aria-label="Task details" tabindex="-1" class:maxed style:width={maxed ? '100%' : `min(${store.width('detail', 480)}px, 100%)`} onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    {#if !maxed}<div class="resizer" role="separator" aria-orientation="vertical" use:resizer={{ key: 'detail', dir: -1, min: 340, max: 1100, fallback: 480 }}></div>{/if}
    <div class="detail-head">
      <button class="check big" class:on={task.done} aria-label="Complete" onclick={() => patch({ done: !task.done })}>{task.done ? '✓' : ''}</button>
      <textarea class="title-input" rows="1" use:autogrow={task.title} value={task.title} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} onchange={(e) => patch({ title: e.currentTarget.value.replace(/\s+/g, ' ').trim() || task.title })}></textarea>
      <button class="icon max-btn" aria-label={maxed ? 'Restore size' : 'Full screen'} title={maxed ? 'Restore size' : 'Full screen'} onclick={() => store.setPref('detailMax', !maxed)}>{maxed ? '❐' : '⤢'}</button>
      <button class="icon" aria-label="Close" onclick={close}>✕</button>
    </div>

    <div class="grid">
      <label>Status
        <select value={task.columnId} onchange={(e) => patch({ columnId: e.currentTarget.value })}>
          {#each store.projectColumns as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      <div class="field-col"><span class="lbl">Priority</span>
        <span class="stars-pick">
          {#each [1, 2, 3, 4, 5] as n (n)}
            <button class="star" class:on={task.priority >= n} aria-label="Priority {n}"
              onclick={() => patch({ priority: (task.priority === n ? 0 : n) as Task['priority'] })}>★</button>
          {/each}
        </span>
      </div>
      <label>Start date
        <input type="date" value={task.start ?? ''} onchange={(e) => patch({ start: e.currentTarget.value || null })} />
      </label>
      <label>Due date
        <input type="date" value={task.due ?? ''} onchange={(e) => patch({ due: e.currentTarget.value || null })} />
      </label>
    </div>

    {#if store.peopleField()}
      <div class="block"><TagPicker {task} field={store.peopleField()!} /></div>
    {/if}

    <div class="grid">
      <label>Estimate (days)
        <input type="number" min="0" step="0.5" value={task.est ?? ''} disabled={task.milestone}
          onchange={(e) => patch({ est: e.currentTarget.value === '' ? null : Math.max(0, Number(e.currentTarget.value)) })} />
      </label>
      <label class="check-row"><input type="checkbox" checked={!!task.milestone} onchange={(e) => patch({ milestone: e.currentTarget.checked })} /> Milestone (◆ on due date)</label>
    </div>

    <div class="block">
      <span class="lbl">Depends on <small class="muted">(this starts after they finish)</small></span>
      <div class="pills">
        {#each deps as d (d.id)}
          <span class="pill dep-pill">{d.title} <button class="icon" aria-label="Remove dependency" onclick={() => patch({ deps: (task.deps ?? []).filter((x) => x !== d.id) })}>✕</button></span>
        {/each}
      </div>
      <select value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) patch({ deps: [...(task.deps ?? []), v] }) }}>
        <option value="">+ Add predecessor…</option>
        {#each depChoices as c (c.id)}<option value={c.id}>{c.title}</option>{/each}
      </select>
    </div>

    <Reminders {task} />

    <div class="block">
      <span class="lbl">Description</span>
      <RichText value={task.description} onsave={(v) => patch({ description: v })} />
    </div>

    {#if task.track}
      <Tracker {task} />
    {:else}
    <div class="block">
      <span class="lbl label-row"><span>Subtasks</span>
        <button class="mini" type="button" title="Steps with status (waiting, in progress…), an activity log and a progress bar" onclick={() => store.enableTracking(task.id)}>📈 Track progress</button>
      </span>
      {#if task.subtasks.length}
        <div class="sub-summary-row">
          <span>{subDone}/{task.subtasks.length} completed</span>
          <strong>{subProgress}%</strong>
        </div>
        <div class="sub-progress" aria-label="Subtasks progress">
          <span class="sub-progress-fill" style:width="{subProgress}%"></span>
        </div>
      {/if}
      <div class="sub-list" use:sortable={{ item: '.sub-item', group: 'subtasks', handle: '.drag-h', onMove: moveSub }}>
      {#each task.subtasks as s (s.id)}
        <div class="sub-item" data-id={s.id}>
          <div class="sub-row">
            <i class="drag-h" aria-hidden="true" title="Drag to reorder">⋮⋮</i>
            <input type="checkbox" checked={s.done} onchange={(e) => setSub(s.id, { done: e.currentTarget.checked })} />
            <span class:struck={s.done}><Linkify text={s.text} /></span>
            <button class="sub-cm" class:has={!!s.comments?.length} aria-label="Comments" aria-expanded={openSub === s.id} title="Comments"
              onclick={() => (openSub = openSub === s.id ? null : s.id)}>💬{s.comments?.length ? ` ${s.comments.length}` : ''}</button>
            <button class="icon" aria-label="Remove subtask" onclick={() => patch({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}>✕</button>
          </div>
          {#if openSub === s.id}
            <div class="sub-comments">
              <Comments comments={s.comments}
                onadd={(t) => setSub(s.id, { comments: [...(s.comments ?? []), { id: crypto.randomUUID(), at: Date.now(), text: t }] })}
                ondelete={(c) => setSub(s.id, { comments: (s.comments ?? []).filter((x) => x.id !== c) })} />
            </div>
          {/if}
        </div>
      {/each}
      </div>
      <input placeholder="Add subtask, Enter" bind:value={newSub} onkeydown={(e) => e.key === 'Enter' && addSub()} />
    </div>
    {/if}

    {#each store.fieldsOf().filter((x) => x.kind !== 'people') as f (f.id)}
      <div class="block"><TagPicker {task} field={f} /></div>
    {/each}

    <div class="block">
      <input class="mini wide" placeholder="+ new tag field (e.g. Client) — Enter" bind:value={newField}
        onkeydown={async (e) => { if (e.key === 'Enter' && newField.trim()) { await store.addField(newField.trim()); newField = '' } }} />
    </div>

    <footer>
      <button class="danger" onclick={() => { if (confirm('Delete this item?')) store.deleteTask(task.id) }}>Delete item</button>
    </footer>
  </div>
</div>
