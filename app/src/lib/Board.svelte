<!--
  VISTA BOARD (kanban): una colonna (Column.svelte) per ogni gruppo di store.groups, piu' il pulsante '+ Add group'.
  Le colonne sono trascinabili (azione sortable.ts -> store.reorderGroup) solo se il raggruppamento ha gruppi modificabili (stato o campo tag).
  Montato da App.svelte quando la vista ha layout 'board' (alternativa: TableView.svelte).
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { sortable } from './sortable'
  import Column from './Column.svelte'

  // Stato locale del campo 'nuovo gruppo': se e' aperto e il testo digitato.
  let adding = $state(false)
  let name = $state('')

  // Crea il nuovo gruppo con il nome digitato (store.addGroup: colonna di stato o scelta del campo tag) e chiude il campo. Chiamata da Invio o dal blur dell'input.
  async function add() {
    await store.addGroup(name)
    name = ''
    adding = false
  }
  // Azione Svelte: mette il focus sull'elemento appena mostrato (usata con use:focusEl).
  function focusEl(n: HTMLElement) { n.focus() }

  // True se esiste almeno un gruppo modificabile: solo allora le colonne si possono riordinare col trascinamento.
  // columns are draggable only when the grouping has editable groups (status / tag field)
  const reorderable = $derived(store.groups.some((g) => g.editable))
</script>

<div class="board" data-drop="0"
  use:sortable={{
    item: reorderable ? '.column:not(.fixed)' : '.nothing',
    group: 'cols',
    handle: '.col-grip',
    onMove: (id, _to, idx) => store.reorderGroup(id, idx),
  }}>
  {#each store.groups as g (g.key)}<Column group={g} />{/each}
  {#if store.canAddGroup}
    <div class="add-group">
      {#if adding}
        <input placeholder="Name" bind:value={name} use:focusEl onblur={add}
          onkeydown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { name = ''; adding = false } }} />
      {:else}
        <button onclick={() => (adding = true)}>+ Add group</button>
      {/if}
    </div>
  {/if}
</div>
