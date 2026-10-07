<!--
  BARRA LATERALE: elenco delle liste (progetti) con creazione, rinomina, eliminazione; indicatore dello stato di sincronizzazione Google e pulsante Impostazioni.
  Su mobile si apre/chiude con il pulsante menu di App.svelte (prop 'open'). Ridimensionabile con resizer.ts. Dati da store.svelte.ts;
  lo stato di sync viene da cloud.svelte.ts e gcal.svelte.ts. Click sull'indicatore o su Settings apre Settings.svelte (store.settingsOpen).
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { resizer } from './resizer'
  import { cloud } from './cloud.svelte'
  import { gcal } from './gcal.svelte'

  let { open = $bindable(false) }: { open?: boolean } = $props()
  // Formatta un istante come ora:minuti locali (per 'Synced 14:32').
  const hhmm = (t: number | null) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')

  // Calcola cosa mostrare nell'indicatore: grigio = sync spenta, verde = funziona, giallo = serve attenzione (login scaduto, errore, vault bloccato). Combina lo stato di cloud e gcal.
  /** green = working, yellow = needs attention (open Settings to reconnect), gray = not used */
  const sync = $derived.by(() => {
    if (!cloud.enabled && !gcal.connected) return { level: 'off', text: 'Sync off', tip: 'Google sync is not set up (Settings)' }
    if (cloud.status === 'syncing') return { level: 'ok', text: 'Syncing…', tip: 'Syncing with Google' }
    if (cloud.authNeeded) return { level: 'warn', text: 'Not synced — reconnect', tip: 'Google sign-in expired. Open Settings and press Sync now / Reconnect.' }
    if (cloud.status === 'error' || cloud.status === 'locked' || gcal.status === 'error')
      return { level: 'warn', text: 'Sync problem', tip: cloud.message || gcal.message || 'Open Settings for details' }
    const t = cloud.enabled ? cloud.lastSync : gcal.lastSync
    return { level: 'ok', text: t ? 'Synced ' + hhmm(t) : 'Sync on', tip: 'Everything is synced. Click to open Settings.' }
  })

  // Stato locale del campo per una nuova lista.
  let adding = $state(false)
  let name = $state('')

  // Crea la lista con il nome digitato (store.addProject) e la seleziona.
  async function add() {
    const n = name.trim()
    if (n) {
      const p = await store.addProject(n)
      store.selectProject(p.id)
    }
    name = ''
    adding = false
  }
  // Azione Svelte: mette il focus sull'elemento appena mostrato.
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
    <button class="side-btn sync {sync.level}" title={sync.tip} onclick={() => (store.settingsOpen = true)}>
      <span class="dot"></span>{sync.text}
    </button>
    <button class="side-btn" onclick={() => { store.setNotesWin({ open: true, min: false }); open = false }}>📝 Notes</button>
    <button class="side-btn" onclick={() => (store.settingsOpen = true)}>⚙ Settings</button>
  </div>
</nav>
