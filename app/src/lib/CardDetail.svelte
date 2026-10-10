<!--
  PANNELLO DI DETTAGLIO di un task (si apre a destra sopra il board/tabella, ridimensionabile con resizer.ts). Modifica ogni proprieta' tramite store.updateTask():
  titolo, stato, priorita' (stelle), scadenza, reminder (Reminders.svelte), descrizione, sottotask, tag (TagPicker.svelte), creazione di nuovi campi tag, eliminazione.
  Montato da App.svelte quando store.openTask esiste (aperto da Card, TableView, Alerts o dopo la creazione di un task). Si chiude con Esc o click fuori.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { resizer } from './resizer'
  import TagPicker from './TagPicker.svelte'
  import Reminders from './Reminders.svelte'
  import Linkify from './Linkify.svelte'
  import type { Task } from './types'

  let { task }: { task: Task } = $props()

  // Testo digitato per un nuovo sottotask e per un nuovo campo tag.
  let newSub = $state('')
  let newField = $state('')
  let imageInput: HTMLInputElement | undefined

  // Scorciatoia: applica una modifica parziale al task aperto (store.updateTask).
  const patch = (p: Partial<Task>) => store.updateTask(task.id, p)

  function readDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result ?? ''))
      fr.onerror = () => reject(new Error('Could not read image'))
      fr.readAsDataURL(file)
    })
  }

  async function attachImages(files: FileList | File[] | null | undefined) {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!images.length) return

    const chunks = await Promise.all(images.map(async (file) => {
      const src = await readDataUrl(file)
      const name = (file.name || 'screenshot').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9 _-]/g, '') || 'screenshot'
      return `\n\n![${name}](${src})`
    }))

    const base = task.description.trim()
    const next = base ? `${base}${chunks.join('')}` : chunks.join('').trimStart()
    patch({ description: next })
    if (imageInput) imageInput.value = ''
  }

  function onPasteImage(e: ClipboardEvent) {
    const files = e.clipboardData?.files
    if (files && Array.from(files).some((f) => f.type.startsWith('image/'))) {
      e.preventDefault()
      void attachImages(files)
    }
  }

  function onDropImages(e: DragEvent) {
    if (!e.dataTransfer?.files.length) return
    const fileList = e.dataTransfer.files
    if (Array.from(fileList).some((f) => f.type.startsWith('image/'))) {
      e.preventDefault()
      void attachImages(fileList)
    }
  }

  // Nella textarea le immagini incorporate (data:image base64) sono mostrate come "image:N"
  // per non riempire il campo di codice; al salvataggio il segnaposto torna al data URI originale.
  const DATA_IMG = /\(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+\)/g
  const shortenImages = (s: string) => {
    let n = 0
    return s.replace(DATA_IMG, () => `(image:${++n})`)
  }
  const restoreImages = (s: string) => {
    const originals = task.description.match(DATA_IMG) ?? []
    return s.replace(/\(image:(\d+)\)/g, (m, i) => originals[Number(i) - 1] ?? m)
  }

  // Aggiunge un sottotask con il testo digitato (Invio nel campo).
  function addSub() {
    const text = newSub.trim()
    if (!text) return
    patch({ subtasks: [...task.subtasks, { id: crypto.randomUUID(), text, done: false }] })
    newSub = ''
  }

  // Modifica un sottotask (spunta/rimuovi 'fatto') sostituendolo nell'elenco del task.
  function setSub(id: string, p: { done?: boolean }) {
    patch({ subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  }

  const subDone = $derived(task.subtasks.filter((s) => s.done).length)
  const subProgress = $derived(task.subtasks.length ? Math.round((subDone / task.subtasks.length) * 100) : 0)

  // Chiude il pannello (store.openTaskId = null): Esc, click sullo sfondo o pulsante X.
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

    <label class="block">
      <span class="label-row">
        <span>Description</span>
        <button class="mini" type="button" onclick={() => imageInput?.click()}>📎 Add image</button>
      </span>
      <input type="file" accept="image/*" multiple hidden bind:this={imageInput} onchange={(e) => void attachImages((e.currentTarget as HTMLInputElement).files)} />
      <textarea rows="4" value={shortenImages(task.description)} onpaste={onPasteImage} ondrop={onDropImages} ondragover={(e) => e.preventDefault()} onchange={(e) => patch({ description: restoreImages(e.currentTarget.value) })}></textarea>
    </label>
    {#if /https?:\/\/|!\[[^\]]*\]\((?:data:image|https?:\/\/)/.test(task.description)}
      <div class="block desc-links"><Linkify text={task.description} /></div>
    {/if}

    <div class="block">
      <span class="lbl">Subtasks</span>
      {#if task.subtasks.length}
        <div class="sub-summary-row">
          <span>{subDone}/{task.subtasks.length} completed</span>
          <strong>{subProgress}%</strong>
        </div>
        <div class="sub-progress" aria-label="Subtasks progress">
          <span class="sub-progress-fill" style:width="{subProgress}%"></span>
        </div>
      {/if}
      {#each task.subtasks as s (s.id)}
        <div class="sub-row">
          <input type="checkbox" checked={s.done} onchange={(e) => setSub(s.id, { done: e.currentTarget.checked })} />
          <span class:struck={s.done}><Linkify text={s.text} /></span>
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
