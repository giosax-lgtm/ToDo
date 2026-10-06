<script lang="ts">
  import { store } from './store.svelte'
  import { COLORS, COLOR_KEYS } from './colors'
  import Pill from './Pill.svelte'
  import type { Field, Task } from './types'

  let { task, field, compact = false }: { task: Task; field: Field; compact?: boolean } = $props()

  let editing = $state(false)
  let colorFor = $state<string | null>(null)
  let draftNew = $state('')

  const options = $derived(store.fieldOptions(field.id))
  const selected = $derived(task.tags[field.id] ?? [])

  function toggle(optId: string) {
    const next = selected.includes(optId) ? selected.filter((x) => x !== optId) : [...selected, optId]
    store.updateTask(task.id, { tags: { ...task.tags, [field.id]: next } })
  }

  async function create() {
    const label = draftNew.trim()
    if (!label) return
    const o = await store.addOption(field.id, label)
    draftNew = ''
    // newly created tag is selected right away
    store.updateTask(task.id, { tags: { ...task.tags, [field.id]: [...selected, o.id] } })
  }
</script>

<div class="tagpicker">
  {#if !compact}
    <div class="tp-head">
      {#if editing}
        <input class="mini" value={field.name} onchange={(e) => store.renameField(field.id, e.currentTarget.value)} />
        <button class="icon" title="Delete field" onclick={() => { if (confirm(`Delete field "${field.name}" from all items?`)) store.deleteField(field.id) }}>🗑</button>
      {:else}
        <span class="lbl">{field.name}</span>
      {/if}
      <button class="icon" class:on={editing} title={editing ? 'Done' : 'Edit tags'} onclick={() => { editing = !editing; colorFor = null }}>{editing ? '✓' : '✎'}</button>
    </div>
  {/if}

  <div class="pills">
    {#each options as o (o.id)}
      {#if editing}
        <span class="opt-edit">
          <input class="mini" value={o.label} onchange={(e) => store.updateOption(o.id, { label: e.currentTarget.value.trim() || o.label })} />
          <button class="swatch" aria-label="Color" style:background={COLORS[o.color]?.bg} onclick={() => (colorFor = colorFor === o.id ? null : o.id)}></button>
          <button class="icon" title="Delete tag" onclick={() => store.deleteOption(o.id)}>✕</button>
          {#if colorFor === o.id}
            <span class="swatches">
              {#each COLOR_KEYS as k (k)}
                <button class="swatch" aria-label={k} style:background={COLORS[k].bg} onclick={() => { store.updateOption(o.id, { color: k }); colorFor = null }}></button>
              {/each}
            </span>
          {/if}
        </span>
      {:else}
        <span class="opt" class:sel={selected.includes(o.id)}>
          <Pill label={o.label} color={o.color} onclick={() => toggle(o.id)} />
        </span>
      {/if}
    {/each}
    <input class="mini" placeholder="+ new tag" bind:value={draftNew} onkeydown={(e) => e.key === 'Enter' && create()} />
  </div>
</div>
