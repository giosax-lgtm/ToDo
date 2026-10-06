<script lang="ts">
  import { store } from './store.svelte'
  import Pill from './Pill.svelte'

  type Menu = 'views' | 'edit' | 'group' | `filter:${string}` | 'addfilter' | null
  let menu = $state<Menu>(null)
  let sub = $state<'filter' | 'sort' | 'hide' | 'group' | null>(null)
  let viewMenu = $state<string | null>(null)

  const d = $derived(store.draft)
  const toggleMenu = (m: Menu) => { menu = menu === m ? null : m; sub = null; viewMenu = null }

  const attrs = $derived(store.attributeKeys)
  const sortKeys = $derived(['name', ...attrs.filter((k) => k !== 'completed'), 'created'])
  const sortLabel = (k: string) => (k === 'name' ? 'Name' : k === 'created' ? 'Created' : store.filterLabel(k))
  const groupLabel = $derived(d.groupBy === 'none' ? 'None' : store.filterLabel(d.groupBy))
  const hideable = $derived([
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'due', label: 'Due date' },
    { key: 'subtasks', label: 'Subtasks' },
    { key: 'reminders', label: 'Reminders' },
    { key: 'description', label: 'Description' },
    ...store.fields.map((f) => ({ key: f.id, label: f.name })),
  ])

  function toggleHidden(key: string) {
    store.updateDraft({ hidden: d.hidden.includes(key) ? d.hidden.filter((x) => x !== key) : [...d.hidden, key] })
  }

  function toggleValue(key: string, value: string) {
    const f = d.filters.find((x) => x.key === key)
    if (!f) return
    store.setFilter(key, { values: f.values.includes(value) ? f.values.filter((v) => v !== value) : [...f.values, value] })
  }

  function newView() {
    const n = prompt('Name of the new view', 'New view')
    if (n) store.createView(n)
    menu = null
  }
</script>

{#if menu}<div class="backdrop" role="presentation" onclick={() => (menu = null)}></div>{/if}

<div class="toolbar">
  <!-- Views -->
  <div class="fwrap">
    <button class="chip strong" onclick={() => toggleMenu('views')}>▤ {store.currentView?.name ?? 'View'} ▾</button>
    {#if menu === 'views'}
      <div class="popover menu">
        <div class="menu-title">Views</div>
        {#each store.projectViews as v (v.id)}
          <div class="menu-row" class:sel={v.id === store.currentViewId}>
            <button class="grow" onclick={() => { store.selectView(v.id); menu = null }}>
              {v.layout === 'table' ? '▦' : '▥'} {v.name}
              {#if v.id === store.defaultViewId}<small class="badge">Default</small>{/if}
              {#if v.id === store.currentViewId}✓{/if}
            </button>
            <button class="icon" aria-label="View options" onclick={() => (viewMenu = viewMenu === v.id ? null : v.id)}>⋮</button>
            {#if viewMenu === v.id}
              <div class="popover side">
                <button onclick={() => { const n = prompt('Rename view', v.name); if (n) store.renameView(v.id, n); viewMenu = null }}>Rename</button>
                <button onclick={() => { store.setDefaultView(v.id); viewMenu = null }}>Set as default view</button>
                {#if store.projectViews.length > 1}
                  <button class="danger" onclick={() => { if (confirm(`Delete view "${v.name}"?`)) store.deleteView(v.id); viewMenu = null }}>Delete view</button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
        <button class="menu-add" onclick={newView}>＋ Save current settings as new view</button>
      </div>
    {/if}
  </div>

  <input class="search" type="search" placeholder="Search…" value={d.search} oninput={(e) => store.updateDraft({ search: e.currentTarget.value })} />

  <!-- Edit view -->
  <div class="fwrap">
    <button class="chip" aria-label="Edit view" onclick={() => toggleMenu('edit')}>⚙ Edit view</button>
    {#if menu === 'edit'}
      <div class="popover menu">
        <div class="menu-title">Edit view</div>
        <button class="menu-item" onclick={() => (sub = sub === 'filter' ? null : 'filter')}>
          <span>Filter</span><small>{d.filters.length ? d.filters.length + ' applied' : ''}</small>
        </button>
        {#if sub === 'filter'}
          <div class="sub">
            {#each attrs.filter((k) => !d.filters.some((f) => f.key === k)) as k (k)}
              <button onclick={() => { store.addFilter(k); menu = `filter:${k}` }}>＋ {store.filterLabel(k)}</button>
            {/each}
          </div>
        {/if}
        <button class="menu-item" onclick={() => (sub = sub === 'sort' ? null : 'sort')}>
          <span>Sort</span><small>{d.sort ? sortLabel(d.sort.key) + (d.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</small>
        </button>
        {#if sub === 'sort'}
          <div class="sub">
            {#each sortKeys as k (k)}
              <button class:sel={d.sort?.key === k} onclick={() => store.updateDraft({ sort: { key: k, dir: d.sort?.key === k && d.sort.dir === 'asc' ? 'desc' : 'asc' } })}>
                {sortLabel(k)} {d.sort?.key === k ? (d.sort.dir === 'asc' ? '↑' : '↓') : ''}
              </button>
            {/each}
            {#if d.sort}<button class="danger" onclick={() => store.updateDraft({ sort: null })}>Remove sort (manual order)</button>{/if}
          </div>
        {/if}
        <button class="menu-item" onclick={() => (sub = sub === 'hide' ? null : 'hide')}>
          <span>Hide fields</span><small>{d.hidden.length ? d.hidden.length + ' hidden' : ''}</small>
        </button>
        {#if sub === 'hide'}
          <div class="sub">
            {#each hideable as h (h.key)}
              <label class="optrow"><input type="checkbox" checked={d.hidden.includes(h.key)} onchange={() => toggleHidden(h.key)} /> {h.label}</label>
            {/each}
          </div>
        {/if}
        <button class="menu-item" onclick={() => (sub = sub === 'group' ? null : 'group')}>
          <span>Group by</span><small>{groupLabel}</small>
        </button>
        {#if sub === 'group'}
          <div class="sub">
            {#each attrs as k (k)}
              <button class:sel={d.groupBy === k} onclick={() => store.updateDraft({ groupBy: k })}>{store.filterLabel(k)}</button>
            {/each}
            <button class="danger" onclick={() => store.updateDraft({ groupBy: 'none' })}>Remove group by</button>
          </div>
        {/if}
        <div class="menu-title">Layout</div>
        <div class="layouts">
          <button class:sel={d.layout === 'table'} onclick={() => store.updateDraft({ layout: 'table' })}>▦<br />Table</button>
          <button class:sel={d.layout === 'board'} onclick={() => store.updateDraft({ layout: 'board' })}>▥<br />Board</button>
        </div>
        <label class="toggle row">Show completed items
          <input type="checkbox" checked={d.showCompleted} onchange={(e) => store.updateDraft({ showCompleted: e.currentTarget.checked })} />
        </label>
      </div>
    {/if}
  </div>

  <!-- Group by -->
  <div class="fwrap">
    <button class="chip" onclick={() => toggleMenu('group')}>Group by: {groupLabel} ▾</button>
    {#if menu === 'group'}
      <div class="popover menu">
        {#each attrs as k (k)}
          <button class="menu-item" class:sel={d.groupBy === k} onclick={() => { store.updateDraft({ groupBy: k }); menu = null }}>
            {d.groupBy === k ? '✓' : ''} {store.filterLabel(k)}
          </button>
        {/each}
        <button class="menu-item danger" onclick={() => { store.updateDraft({ groupBy: 'none' }); menu = null }}>🗑 Remove group by</button>
      </div>
    {/if}
  </div>

  <!-- Active filters -->
  {#each d.filters as f (f.key)}
    <div class="fwrap">
      <button class="chip" class:active={f.values.length > 0} onclick={() => toggleMenu(`filter:${f.key}`)}>
        {store.filterLabel(f.key)}{f.values.length ? ` ${f.op === 'includes' ? '=' : '≠'} ${f.values.length}` : ''} ▾
      </button>
      {#if menu === `filter:${f.key}`}
        <div class="popover menu">
          <select value={f.op} onchange={(e) => store.setFilter(f.key, { op: e.currentTarget.value as 'includes' | 'excludes' })}>
            <option value="includes">includes</option>
            <option value="excludes">excludes</option>
          </select>
          {#each store.filterOptions(f.key) as o (o.value)}
            <label class="optrow">
              <input type="checkbox" checked={f.values.includes(o.value)} onchange={() => toggleValue(f.key, o.value)} />
              <Pill label={o.label} color={o.color} />
            </label>
          {/each}
          <button class="menu-item danger" onclick={() => { store.removeFilter(f.key); menu = null }}>🗑 Remove filter</button>
        </div>
      {/if}
    </div>
  {/each}

  <div class="fwrap">
    <button class="chip" onclick={() => toggleMenu('addfilter')}>＋ Filter</button>
    {#if menu === 'addfilter'}
      <div class="popover menu">
        {#each attrs.filter((k) => !d.filters.some((f) => f.key === k)) as k (k)}
          <button class="menu-item" onclick={() => { store.addFilter(k); menu = `filter:${k}` }}>{store.filterLabel(k)}</button>
        {:else}<span class="muted">All filters in use</span>{/each}
      </div>
    {/if}
  </div>

  {#if store.dirty}
    <span class="spacer"></span>
    <span class="muted">View modified</span>
    <button class="chip" onclick={() => store.resetDraft()}>Reset</button>
    <button class="chip primary" onclick={() => store.saveView()}>Save view</button>
    <button class="chip" onclick={newView}>Save as new</button>
  {/if}
</div>
