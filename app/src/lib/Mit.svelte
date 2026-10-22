<!--
  TOOL "MIT E REGOLA 1-3-5": limita le priorita' del giorno. MIT = da 1 a 3 attivita' davvero importanti; 1-3-5 = un compito grande, tre medi, cinque piccoli.
  Ogni voce e' testo libero oppure un task della lista corrente (collegato: spuntarlo qui lo completa anche nella lista). Salvato come preferenza 'mitDay'
  ({date, items}); il giorno dopo si riparte da una pagina vuota. La modalita' scelta e' la preferenza 'mitMode'.
-->

<script lang="ts">
  import { store, today } from './store.svelte'

  type Size = 'mit' | 'big' | 'med' | 'small'
  interface Item { id: string; size: Size; text: string; done: boolean; taskId?: string }
  type Mode = 'mit' | '135'

  const SLOTS: Record<Mode, { size: Size; label: string; n: number }[]> = {
    mit: [{ size: 'mit', label: 'Most Important Tasks', n: 3 }],
    '135': [
      { size: 'big', label: 'Big · 1', n: 1 },
      { size: 'med', label: 'Medium · 3', n: 3 },
      { size: 'small', label: 'Small · 5', n: 5 },
    ],
  }

  const mode = $derived(store.pref<Mode>('mitMode', 'mit'))
  const day = $derived(store.pref<{ date: string; items: Item[] }>('mitDay', { date: '', items: [] }))
  const items = $derived(day.date === today() ? day.items : [])
  const save = (next: Item[]) => store.setPref('mitDay', { date: today(), items: next })
  const taskOf = (i: Item) => (i.taskId ? store.tasks.find((t) => t.id === i.taskId) : undefined)
  const isDone = (i: Item) => (i.taskId ? taskOf(i)?.done ?? i.done : i.done)
  const of = (s: Size) => items.filter((i) => i.size === s)

  const candidates = $derived(store.tasks.filter((t) => t.projectId === store.currentProjectId && !t.done && !items.some((i) => i.taskId === t.id)))

  let drafts = $state<Record<string, string>>({})
  let picks = $state<Record<string, string>>({})

  function addText(size: Size) {
    const s = (drafts[size] ?? '').trim()
    if (!s) return
    save([...items, { id: crypto.randomUUID(), size, text: s, done: false }])
    drafts[size] = ''
  }
  function addTask(size: Size) {
    const id = picks[size]
    if (!id) return
    save([...items, { id: crypto.randomUUID(), size, text: '', done: false, taskId: id }])
    picks[size] = ''
  }
  async function toggle(i: Item) {
    const v = !isDone(i)
    save(items.map((x) => (x.id === i.id ? { ...x, done: v } : x)))
    if (i.taskId && taskOf(i)) await store.updateTask(i.taskId, { done: v })
  }
  const remove = (id: string) => save(items.filter((i) => i.id !== id))

  const total = $derived(SLOTS[mode].reduce((n, s) => n + s.n, 0))
  const finished = $derived(items.filter((i) => SLOTS[mode].some((s) => s.size === i.size) && isDone(i)).length)
</script>

<div class="tool-body">
  <p class="tool-desc">
    Too many priorities means none. <b>MIT</b>: pick 1–3 tasks that really matter today. <b>1-3-5</b>: one big, three medium and five small tasks, adjusted to the time you have.
    Choose before you start; anything beyond the slots waits for tomorrow.
  </p>

  <div class="layouts mit-mode">
    <button class:sel={mode === 'mit'} onclick={() => store.setPref('mitMode', 'mit')}>MIT · 1–3</button>
    <button class:sel={mode === '135'} onclick={() => store.setPref('mitMode', '135')}>1 · 3 · 5</button>
  </div>

  <p class="muted mit-sum">Today · {finished} of {total} slots done</p>

  {#each SLOTS[mode] as s (s.size)}
    {@const list = of(s.size)}
    <section class="mit-sec">
      <h3>{s.label} <small class="muted">{list.length}/{s.n}</small></h3>
      {#each list as i (i.id)}
        {@const t = taskOf(i)}
        <div class="mit-item">
          <input type="checkbox" checked={isDone(i)} onchange={() => toggle(i)} aria-label="Done" />
          {#if t}
            <button class="mit-text" class:struck={isDone(i)} title="Open task" onclick={() => (store.openTaskId = t.id)}>▤ {t.title}</button>
          {:else}
            <span class="mit-text" class:struck={isDone(i)}>{i.text}</span>
          {/if}
          <button class="ei-x" title="Remove" onclick={() => remove(i.id)}>✕</button>
        </div>
      {/each}
      {#if list.length < s.n}
        <div class="ei-add">
          <input placeholder="Write a task…" bind:value={drafts[s.size]} onkeydown={(e) => e.key === 'Enter' && addText(s.size)} />
          <button class="chip primary" onclick={() => addText(s.size)} disabled={!(drafts[s.size] ?? '').trim()}>Add</button>
        </div>
        <div class="ei-add">
          <select bind:value={picks[s.size]} aria-label="Task from the list">
            <option value="">…or pick one from this list</option>
            {#each candidates as t (t.id)}<option value={t.id}>{t.title}</option>{/each}
          </select>
          <button class="chip" onclick={() => addTask(s.size)} disabled={!picks[s.size]}>Add task</button>
        </div>
      {/if}
    </section>
  {/each}
</div>
