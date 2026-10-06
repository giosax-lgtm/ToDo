<script lang="ts">
  import { store } from './store.svelte'
  import { sortable } from './sortable'
  import Column from './Column.svelte'

  let adding = $state(false)
  let name = $state('')

  async function add() {
    await store.addGroup(name)
    name = ''
    adding = false
  }
  function focusEl(n: HTMLElement) { n.focus() }

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
