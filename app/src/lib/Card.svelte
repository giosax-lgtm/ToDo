<!--
  CARD di un task nel board: titolo con checkbox di completamento, meta (priorita', sottotask, prossimo reminder, scadenza), descrizione e tag.
  Cosa si vede dipende dai campi nascosti della vista corrente (store.draft.hidden, scelti nella Toolbar). Click = apre CardDetail.svelte (store.openTaskId).
  Usata da Column.svelte (una per task). Usa Pill.svelte per i tag e Linkify.svelte per i link cliccabili; data-id serve a sortable.ts per il drag & drop.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import Pill from './Pill.svelte'
  import Linkify from './Linkify.svelte'
  import type { Task } from './types'

  let { task }: { task: Task } = $props()

  // Valori derivati per il disegno: campi nascosti, sottotask completati, scadenza superata, prossimo reminder non scattato e tag raggruppati per campo.
  const hidden = $derived(store.draft.hidden)
  const subDone = $derived(task.subtasks.filter((s) => s.done).length)
  const overdue = $derived(!!task.due && !task.done && task.due < new Date().toISOString().slice(0, 10))
  const showPriority = $derived(!!task.priority && !hidden.includes('priority'))
  const showDue = $derived(!!task.due && !hidden.includes('due'))
  const nextRem = $derived(task.reminders.filter((r) => !r.fired).map((r) => r.at).sort()[0])
  const showRem = $derived(!!nextRem && !hidden.includes('reminders'))
  const showSub = $derived(task.subtasks.length > 0 && !hidden.includes('subtasks'))
  const tagGroups = $derived(
    store.fields
      .filter((f) => !hidden.includes(f.id))
      .map((f) => ({
        field: f,
        opts: (task.tags[f.id] ?? []).map((id) => store.options.find((o) => o.id === id)).filter((o) => !!o),
      }))
      .filter((g) => g.opts.length),
  )
</script>

<div class="card" class:done={task.done} data-id={task.id} role="button" tabindex="0"
  onclick={() => (store.openTaskId = task.id)}
  onkeydown={(e) => e.key === 'Enter' && (store.openTaskId = task.id)}>
  <div class="card-head">
    <button class="check" class:on={task.done} aria-label="Complete"
      onclick={(e) => { e.stopPropagation(); store.updateTask(task.id, { done: !task.done }) }}>
      {task.done ? '✓' : ''}
    </button>
    <span class="card-title"><Linkify text={task.title} /></span>
  </div>
  {#if showPriority || showDue || showSub || showRem}
    <div class="meta">
      {#if showPriority}<span class="stars">{'★'.repeat(task.priority)}</span>{/if}
      {#if showSub}<span>☑ {subDone}/{task.subtasks.length}</span>{/if}
      {#if showRem}<span title="Next reminder">🔔 {nextRem.replace('T', ' ')}</span>{/if}
      {#if showDue}<span class:overdue>📅 {task.due}</span>{/if}
    </div>
  {/if}
  {#if task.description && !hidden.includes('description')}
    <p class="card-desc"><Linkify text={task.description} /></p>
  {/if}
  {#each tagGroups as g (g.field.id)}
    <div class="tag-row">
      <span class="tag-label">{g.field.name}</span>
      <div class="pills">{#each g.opts as o (o.id)}<Pill label={o.label} color={o.color} />{/each}</div>
    </div>
  {/each}
</div>
