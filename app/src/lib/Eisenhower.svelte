<!--
  TOOL "MATRICE DI EISENHOWER": quattro quadranti (urgente/importante). Le voci possono essere task gia' presenti nella lista corrente (collegati: titolo e
  stato "fatto" restano quelli del task) oppure idee libere. Le idee libere NON entrano nella to-do list da sole: il pulsante "→ To-do" le trasforma in task
  (con priorita' suggerita dal quadrante) e da quel momento restano collegate. Le voci sono salvate per lista come preferenza ('eisenhower:<listId>').
  Trascinamento dei chip tra quadranti (desktop) oppure menu "sposta" (anche su mobile).
-->

<script lang="ts">
  import { store } from './store.svelte'

  interface Item { id: string; text: string; q: 1 | 2 | 3 | 4; taskId?: string }
  type Q = Item['q']

  const QUADS: { q: Q; title: string; sub: string; hint: string; prio: 0 | 1 | 2 | 3 | 4 | 5; cls: string }[] = [
    { q: 1, title: 'Do first', sub: 'Urgent · Important', hint: 'Crises, deadlines. Do it now.', prio: 5, cls: 'q1' },
    { q: 2, title: 'Schedule', sub: 'Not urgent · Important', hint: 'Study, health, growth, relationships, projects. Protect this time.', prio: 4, cls: 'q2' },
    { q: 3, title: 'Delegate / limit', sub: 'Urgent · Not important', hint: 'Other people’s urgencies. Delegate, shorten or say no.', prio: 2, cls: 'q3' },
    { q: 4, title: 'Eliminate', sub: 'Not urgent · Not important', hint: 'Time wasters. Drop them.', prio: 1, cls: 'q4' },
  ]

  const key = $derived('eisenhower:' + store.currentProjectId)
  const items = $derived(store.pref<Item[]>(key, []))
  const save = (next: Item[]) => store.setPref(key, next.length ? next : undefined)
  const taskOf = (i: Item) => (i.taskId ? store.tasks.find((t) => t.id === i.taskId) : undefined)
  // Una voce collegata a un task che non esiste piu' viene ignorata.
  const live = $derived(items.filter((i) => !i.taskId || taskOf(i)))
  const inQ = (q: Q) => live.filter((i) => i.q === q)

  // Task aperti della lista non ancora nella matrice.
  const candidates = $derived(
    store.tasks.filter((t) => t.projectId === store.currentProjectId && !t.done && !items.some((i) => i.taskId === t.id)),
  )

  let text = $state('')
  let target = $state<Q>(2)
  let pick = $state('')

  function addIdea() {
    const s = text.trim()
    if (!s) return
    save([...items, { id: crypto.randomUUID(), text: s, q: target }])
    text = ''
  }
  function addTask() {
    if (!pick) return
    save([...items, { id: crypto.randomUUID(), text: '', q: target, taskId: pick }])
    pick = ''
  }
  const move = (id: string, q: Q) => save(items.map((i) => (i.id === id ? { ...i, q } : i)))
  const remove = (id: string) => save(items.filter((i) => i.id !== id))

  // Idea -> task vero nella lista corrente, con la priorita' suggerita dal quadrante.
  async function promote(i: Item) {
    const t = await store.addTask(i.text)
    await store.updateTask(t.id, { priority: QUADS[i.q - 1].prio })
    save(items.map((x) => (x.id === i.id ? { ...x, taskId: t.id, text: '' } : x)))
  }

  // Drag & drop tra quadranti.
  let dragId = $state<string | null>(null)
  let over = $state<Q | null>(null)
  function drop(q: Q) {
    if (dragId) move(dragId, q)
    dragId = null
    over = null
  }
</script>

<div class="tool-body">
  <p class="tool-desc">
    Sort what's on your plate by <b>urgent</b> vs <b>important</b>. Do quadrant 1, <b>schedule quadrant 2</b> (study, health, growth, projects: where long-term results come from),
    limit 3 and drop 4. Add ideas below or pick tasks from this list; ideas stay here until you press <b>→ To-do</b>.
  </p>

  <div class="ei-add">
    <input placeholder="New idea or activity…" bind:value={text} onkeydown={(e) => e.key === 'Enter' && addIdea()} />
    <select bind:value={target} aria-label="Quadrant">
      {#each QUADS as d (d.q)}<option value={d.q}>{d.q} · {d.title}</option>{/each}
    </select>
    <button class="chip primary" onclick={addIdea} disabled={!text.trim()}>Add</button>
  </div>
  <div class="ei-add">
    <select bind:value={pick} aria-label="Task from the list">
      <option value="">Add a task from this list…</option>
      {#each candidates as t (t.id)}<option value={t.id}>{t.title}</option>{/each}
    </select>
    <button class="chip" onclick={addTask} disabled={!pick}>Add task</button>
  </div>

  <div class="ei-grid">
    <span class="ei-axis x1">Urgent</span><span class="ei-axis x2">Not urgent</span>
    <span class="ei-axis y1">Important</span><span class="ei-axis y2">Not important</span>
    {#each QUADS as d (d.q)}
      <section class="ei-q {d.cls}" class:over={over === d.q} role="group" aria-label={d.title}
        ondragover={(e) => { e.preventDefault(); over = d.q }} ondragleave={() => (over = null)} ondrop={(e) => { e.preventDefault(); drop(d.q) }}>
        <header><b>{d.q} · {d.title}</b><small>{d.sub}</small></header>
        <p class="ei-hint">{d.hint}</p>
        {#each inQ(d.q) as i (i.id)}
          {@const t = taskOf(i)}
          <div class="ei-item" class:isdone={t?.done} draggable="true" role="listitem"
            ondragstart={() => (dragId = i.id)} ondragend={() => { dragId = null; over = null }}>
            {#if t}
              <button class="ei-text" title="Open task" onclick={() => (store.openTaskId = t.id)}>▤ {t.title}</button>
            {:else}
              <span class="ei-text">💡 {i.text}</span>
              <button class="ei-go" title="Create a task in this list from this idea" onclick={() => promote(i)}>→ To-do</button>
            {/if}
            <select class="ei-move" aria-label="Move to quadrant" value={i.q} onchange={(e) => move(i.id, Number((e.target as HTMLSelectElement).value) as Q)}>
              {#each QUADS as o (o.q)}<option value={o.q}>{o.q}</option>{/each}
            </select>
            <button class="ei-x" title={t ? 'Remove from the matrix (the task stays in the list)' : 'Delete'} onclick={() => remove(i.id)}>✕</button>
          </div>
        {:else}<span class="muted ei-empty">Drop items here</span>{/each}
      </section>
    {/each}
  </div>
</div>
