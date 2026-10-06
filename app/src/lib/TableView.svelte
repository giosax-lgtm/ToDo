<!--
  VISTA TABELLA: un blocco per gruppo (store.groups) con righe-task modificabili in linea (stato, priorita', scadenza, tag) e intestazioni cliccabili per ordinare.
  Le righe sono trascinabili tra gruppi con sortable.ts -> store.moveTask. Le colonne mostrate dipendono dai campi nascosti della vista (store.draft.hidden).
  Montata da App.svelte quando la vista ha layout 'table' (alternativa: Board.svelte). Usa TagPicker.svelte per i tag e Pill.svelte per le etichette.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { COLORS } from './colors'
  import { sortable } from './sortable'
  import Pill from './Pill.svelte'
  import TagPicker from './TagPicker.svelte'
  import type { Group, Task } from './types'

  // Stato locale: cella dei tag con popover aperto, gruppo in cui si sta aggiungendo un task e relativo titolo.
  let openCell = $state<string | null>(null)
  let addingIn = $state<string | null>(null)
  let newTitle = $state('')

  const hidden = $derived(store.draft.hidden)
  // Colonne dinamiche (stato, priorita', scadenza e un campo per ogni campo tag) escludendo quelle nascoste dalla vista.
  const cols = $derived([
    ...(hidden.includes('status') ? [] : [{ key: 'status', label: 'Status' }]),
    ...(hidden.includes('priority') ? [] : [{ key: 'priority', label: 'Priority' }]),
    ...(hidden.includes('due') ? [] : [{ key: 'due', label: 'Due date' }]),
    ...store.fields.filter((f) => !hidden.includes(f.id)).map((f) => ({ key: f.id, label: f.name })),
  ])
  // Valore CSS grid-template-columns per intestazione e righe, calcolato dal numero di colonne.
  const template = $derived(`32px minmax(240px, 3fr) repeat(${cols.length}, minmax(120px, 1fr))`)

  // Click su un'intestazione: cicla ordinamento crescente -> decrescente -> nessuno (store.updateDraft).
  function sortBy(key: string) {
    const s = store.draft.sort
    if (!s || s.key !== key) store.updateDraft({ sort: { key, dir: 'asc' } })
    else if (s.dir === 'asc') store.updateDraft({ sort: { key, dir: 'desc' } })
    else store.updateDraft({ sort: null })
  }

  // Crea un task nel gruppo (store.addTask) e ne apre il dettaglio.
  async function add(g: Group) {
    const t = newTitle.trim()
    if (!t) return
    const task = await store.addTask(t, g)
    newTitle = ''
    addingIn = null
    store.openTaskId = task.id
  }

  // Azione Svelte: mette il focus sull'elemento appena mostrato.
  function focusEl(n: HTMLElement) { n.focus() }
  // Callback di sortable.ts al rilascio di una riga: store.moveTask nel gruppo/posizione di arrivo.
  function onMove(id: string, to: HTMLElement, idx: number) { store.moveTask(id, to.dataset.col!, idx) }
  // Chiave di ordinamento di una colonna (coincide con la chiave della colonna: stato, priorita', scadenza o id del campo).
  const sortKey = (k: string) => (k === 'status' || k === 'priority' || k === 'due' ? k : k)
</script>

<div class="table-wrap">
  <div class="trow thead" style:grid-template-columns={template}>
    <span></span>
    <button class="th" onclick={() => sortBy('name')}>Name {store.draft.sort?.key === 'name' ? (store.draft.sort.dir === 'asc' ? '↑' : '↓') : ''}</button>
    {#each cols as c (c.key)}
      <button class="th" onclick={() => sortBy(sortKey(c.key))}>{c.label} {store.draft.sort?.key === c.key ? (store.draft.sort.dir === 'asc' ? '↑' : '↓') : ''}</button>
    {/each}
  </div>

  {#each store.groups as g (g.key)}
    {@const rows = store.groupTasks(g)}
    <div class="tgroup-head" style:background={COLORS[g.color]?.bg} style:color={COLORS[g.color]?.fg}>
      {g.label} <small>{rows.length}</small>
    </div>
    <div class="tbody" data-col={g.key} data-drop={g.apply ? '1' : '0'}
      use:sortable={{ item: '.trow', group: 'rows', sort: !store.draft.sort, onMove }}>
      {#each rows as t (t.id)}
        {@render row(t)}
      {/each}
    </div>
    {#if g.apply}
      {#if addingIn === g.key}
        <input class="add-input" placeholder="Item title, Enter" bind:value={newTitle} use:focusEl
          onkeydown={(e) => { if (e.key === 'Enter') add(g); if (e.key === 'Escape') { addingIn = null; newTitle = '' } }}
          onblur={() => { addingIn = null; newTitle = '' }} />
      {:else}
        <button class="add-item" onclick={() => (addingIn = g.key)}>+ Add item</button>
      {/if}
    {/if}
  {/each}
</div>

<!-- Snippet: disegna una riga-task (checkbox, nome, e una cella editabile per ogni colonna visibile). -->
{#snippet row(t: Task)}
  <div class="trow" class:done={t.done} data-id={t.id} style:grid-template-columns={template}>
    <button class="check" class:on={t.done} aria-label="Complete" onclick={() => store.updateTask(t.id, { done: !t.done })}>{t.done ? '✓' : ''}</button>
    <button class="tname" onclick={() => (store.openTaskId = t.id)}>{t.title}</button>
    {#each cols as c (c.key)}
      <div class="tcell">
        {#if c.key === 'status'}
          <select value={t.columnId} onchange={(e) => store.updateTask(t.id, { columnId: e.currentTarget.value })}>
            {#each store.projectColumns as col (col.id)}<option value={col.id}>{col.name}</option>{/each}
          </select>
        {:else if c.key === 'priority'}
          <span class="stars-pick">
            {#each [1, 2, 3, 4, 5] as n (n)}
              <button class="star sm" class:on={t.priority >= n} aria-label="Priority {n}"
                onclick={() => store.updateTask(t.id, { priority: (t.priority === n ? 0 : n) as Task['priority'] })}>★</button>
            {/each}
          </span>
        {:else if c.key === 'due'}
          <input type="date" value={t.due ?? ''} onchange={(e) => store.updateTask(t.id, { due: e.currentTarget.value || null })} />
        {:else}
          {@const f = store.fields.find((x) => x.id === c.key)!}
          <button class="pills cellbtn" onclick={() => (openCell = openCell === t.id + c.key ? null : t.id + c.key)}>
            {#each (t.tags[c.key] ?? []) as id (id)}
              {@const o = store.options.find((x) => x.id === id)}
              {#if o}<Pill label={o.label} color={o.color} />{/if}
            {:else}<span class="muted">—</span>{/each}
          </button>
          {#if openCell === t.id + c.key}
            <div class="popover left"><TagPicker task={t} field={f} /></div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
{/snippet}
