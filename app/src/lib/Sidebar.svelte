<script lang="ts">
  import { store } from './store.svelte'
  import { resizer } from './resizer'

  let { open = $bindable(false) }: { open?: boolean } = $props()
  let adding = $state(false)
  let name = $state('')

  async function add() {
    const n = name.trim()
    if (n) {
      const p = await store.addProject(n)
      store.selectProject(p.id)
    }
    name = ''
    adding = false
  }
  function focusEl(n: HTMLElement) { n.focus() }
</script>

<nav class="sidebar" class:open style:width="{store.width('sidebar', 240)}px">
  <div class="resizer" role="separator" aria-orientation="vertical" use:resizer={{ key: 'sidebar', dir: 1, min: 160, max: 480, fallback: 240 }}></div>
  <div class="brand">✔ toDo</div>
  <div class="side-title">
    <span>Lists</span>
    <button class="icon light" title="New list" onclick={() => (adding = true)}>+</button>
  </div>
  {#each store.projects as p (p.id)}
    <div class="side-item" class:active={p.id === store.currentProjectId}>
      <button class="side-btn" onclick={() => { store.selectProject(p.id); open = false }}>▤ {p.name}</button>
      {#if p.id === store.currentProjectId}
        <button class="icon light" title="Rename" onclick={() => { const n = prompt('Rename list', p.name); if (n) store.renameProject(p.id, n) }}>✎</button>
        {#if store.projects.length > 1}
          <button class="icon light" title="Delete list" onclick={() => { if (confirm(`Delete list "${p.name}" and all its items?`)) store.deleteProject(p.id) }}>🗑</button>
        {/if}
      {/if}
    </div>
  {/each}
  {#if adding}
    <input class="side-input" placeholder="List name" bind:value={name} use:focusEl
      onkeydown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { adding = false; name = '' } }}
      onblur={add} />
  {/if}
  <div class="side-foot">
    <button class="side-btn" onclick={() => (store.settingsOpen = true)}>⚙ Settings</button>
  </div>
</nav>
