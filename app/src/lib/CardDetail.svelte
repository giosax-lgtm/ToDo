<script lang="ts">
  import { store } from './store.svelte'
  import { resizer } from './resizer'
  import TagPicker from './TagPicker.svelte'
  import Reminders from './Reminders.svelte'
  import type { Task } from './types'

  let { task }: { task: Task } = $props()

  let newSub = $state('')
  let newField = $state('')

  const patch = (p: Partial<Task>) => store.updateTask(task.id, p)

  function addSub() {
    const text = newSub.trim()
    if (!text) return
    patch({ subtasks: [...task.subtasks, { id: crypto.randomUUID(), text, done: false }] })
    newSub = ''
  }

  function setSub(id: string, p: { done?: boolean }) {
    patch({ subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  }

  function close() { store.openTaskId = null }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="overlay" role="presentation" onclick={close}>
  <div class="detail" role="dialog" aria-label="Task details" tabindex="-1" style:width="min({store.width('detail', 480)}px, 100%)" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <div class="resizer" role="separator" aria-orientation="vertical" use:resizer={{ key: 'detail', dir: -1, min: 340, max: 1100, fallback: 480 }}></div>
    <div class="detail-head">
      <button class="check big" class:on={task.done} aria-label="Complete" onclick={() => patch({ done: !task.done })}>{task.done ? '✓' : ''}</button>
      <input class="title-input" value={task.title} onchange={(e) => patch({ title: e.currentTarget.value.trim() || task.title })} />
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
      <label>Due date
        <input type="date" value={task.due ?? ''} onchange={(e) => patch({ due: e.currentTarget.value || null })} />
      </label>
    </div>

    <Reminders {task} />

    <label class="block">Description
      <textarea rows="4" value={task.description} onchange={(e) => patch({ description: e.currentTarget.value })}></textarea>
    </label>

    <div class="block">
      <span class="lbl">Subtasks</span>
      {#each task.subtasks as s (s.id)}
        <div class="sub">
          <input type="checkbox" checked={s.done} onchange={(e) => setSub(s.id, { done: e.currentTarget.checked })} />
          <span class:struck={s.done}>{s.text}</span>
          <button class="icon" aria-label="Remove subtask" onclick={() => patch({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}>✕</button>
        </div>
      {/each}
      <input placeholder="Add subtask, Enter" bind:value={newSub} onkeydown={(e) => e.key === 'Enter' && addSub()} />
    </div>

    {#each store.fields as f (f.id)}
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
