<!--
  COLONNA del board per UN gruppo (Group): intestazione (nome, contatore, menu rinomina/colore/elimina), elenco di card (Card.svelte) e aggiunta rapida di task.
  Le card sono trascinabili tra colonne con sortable.ts: al rilascio onMove chiama store.moveTask. I task mostrati arrivano da store.groupTasks(group).
  Usata da Board.svelte (una per gruppo). I colori vengono da lib/colors.ts.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { COLORS, COLOR_KEYS } from './colors'
  import { sortable } from './sortable'
  import Card from './Card.svelte'
  import type { Group } from './types'

  let { group }: { group: Group } = $props()

  // Stato locale: campo di aggiunta aperto, titolo digitato, menu '...' aperto, nome in modifica.
  let adding = $state(false)
  let newTitle = $state('')
  let menu = $state(false)
  let editing = $state(false)

  // Task visibili del gruppo, colore della colonna e se si possono aggiungere/rilasciare card (group.apply non nullo).
  const tasks = $derived(store.groupTasks(group))
  const c = $derived(COLORS[group.color] ?? COLORS.gray)
  const canAdd = $derived(group.apply !== null)

  // Crea il task nel gruppo (store.addTask). Invio: lo crea e apre il dettaglio per completarlo; Ctrl+Invio: lo crea e resta nel campo per aggiungerne altri.
  /** Enter: create and open the item so tags, priority, etc. can be set. Ctrl+Enter: quick add. */
  async function add(open: boolean) {
    const t = newTitle.trim()
    if (!t) return
    const task = await store.addTask(t, group)
    newTitle = ''
    if (open) {
      adding = false
      store.openTaskId = task.id
    }
  }

  // Azione Svelte: mette il focus sull'elemento appena mostrato.
  function focusEl(n: HTMLElement) { n.focus() }

  // Callback di sortable.ts al rilascio di una card: la sposta nel gruppo di arrivo e nella posizione indicata (store.moveTask).
  function onMove(id: string, to: HTMLElement, idx: number) {
    store.moveTask(id, to.dataset.col!, idx)
  }
</script>

<section class="column" class:fixed={group.fixed} data-id={group.key} style:background={c.col}>
  <header>
    {#if group.editable}<span class="col-grip" title="Drag to reorder">⠿</span>{/if}
    {#if editing}
      <input class="col-name-input" value={group.label} use:focusEl
        onblur={(e) => { store.renameGroup(group, e.currentTarget.value); editing = false }}
        onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    {:else}
      <h3 style:color={c.fg} ondblclick={() => group.editable && (editing = true)}>{group.label} <small>{tasks.length}</small></h3>
    {/if}
    <div class="col-actions">
      {#if canAdd}<button class="icon" title="Add item" onclick={() => (adding = true)}>+</button>{/if}
      {#if group.editable}
        <button class="icon" title="Options" onclick={() => (menu = !menu)}>⋯</button>
        {#if menu}
          <div class="popover">
            <button onclick={() => { editing = true; menu = false }}>Rename</button>
            <div class="swatches">
              {#each COLOR_KEYS as k (k)}
                <button class="swatch" aria-label={k} style:background={COLORS[k].bg}
                  onclick={() => { store.recolorGroup(group, k); menu = false }}></button>
              {/each}
            </div>
            <button class="danger" onclick={() => { if (confirm(`Delete "${group.label}"?`)) store.deleteGroup(group); menu = false }}>Delete</button>
          </div>
        {/if}
      {/if}
    </div>
  </header>

  <div class="cards" data-col={group.key} data-drop={canAdd ? '1' : '0'}
    use:sortable={{ item: '.card', group: 'cards', sort: !store.draft.sort, onMove }}>
    {#each tasks as t (t.id)}<Card task={t} />{/each}
  </div>

  {#if adding}
    <input class="add-input" placeholder="Item title — Enter to add &amp; edit, Ctrl+Enter to keep adding" bind:value={newTitle} use:focusEl
      onkeydown={(e) => { if (e.key === 'Enter') add(!e.ctrlKey); if (e.key === 'Escape') { adding = false; newTitle = '' } }}
      onblur={() => { adding = false; newTitle = '' }} />
  {:else if canAdd}
    <button class="add-item" onclick={() => (adding = true)}>+ Add item</button>
  {/if}
</section>
