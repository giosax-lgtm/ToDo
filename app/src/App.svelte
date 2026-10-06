<script lang="ts">
  import { onMount } from 'svelte'
  import { store } from './lib/store.svelte'
  import Sidebar from './lib/Sidebar.svelte'
  import Board from './lib/Board.svelte'
  import TableView from './lib/TableView.svelte'
  import CardDetail from './lib/CardDetail.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import Alerts from './lib/Alerts.svelte'
  import Settings from './lib/Settings.svelte'
  import { gcal } from './lib/gcal.svelte'
  import { cloud } from './lib/cloud.svelte'
  import { hasValidToken } from './lib/google'

  let sidebarOpen = $state(false)

  // appearance prefs -> CSS variables
  // theme: light | dark | claude | system
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  let systemDark = $state(darkQuery.matches)
  $effect(() => {
    const on = () => (systemDark = darkQuery.matches)
    darkQuery.addEventListener('change', on)
    return () => darkQuery.removeEventListener('change', on)
  })
  $effect(() => {
    const t = store.pref('theme', 'system')
    document.documentElement.dataset.theme = t === 'claude' ? 'claude' : t === 'dark' || (t === 'system' && systemDark) ? 'dark' : 'light'
  })

  $effect(() => {
    const r = document.documentElement
    r.style.fontSize = (14 * store.pref('uiScale', 100)) / 100 + 'px'
    r.style.setProperty('--ts', String(store.pref('textScale', 100) / 100))
    r.style.setProperty('--col-w', store.pref('colW', 290) / 14 + 'rem')
    r.style.setProperty('--font', store.pref('font', 'Lato, "Segoe UI", system-ui, sans-serif'))
  })

  // push reminders to Google Calendar shortly after they change
  $effect(() => {
    if (!store.ready || !gcal.connected) return
    JSON.stringify(store.tasks.map((t) => [t.id, t.done, t.title, t.reminders]))
    const h = setTimeout(() => gcal.sync(), 4000)
    return () => clearTimeout(h)
  })

  // encrypted cloud sync: shortly after local changes
  $effect(() => {
    if (!store.ready || !cloud.enabled) return
    store.syncEntities()
    const h = setTimeout(() => cloud.autoSync('change'), 5000)
    return () => clearTimeout(h)
  })

  onMount(() => {
    // ask the browser not to evict our data when the disk is low
    void navigator.storage?.persist?.()
    store.init().then(async () => {
      gcal.init()
      await cloud.init()
      store.checkReminders()
      if (cloud.enabled || gcal.connected) await cloud.ensureAuth(false) // just marks 'reconnect needed', no popup
      cloud.autoSync('start')
      if (gcal.connected) void gcal.sync()
    })
    const tick = setInterval(() => {
      if (!store.ready) return
      cloud.authNeeded = (cloud.enabled || gcal.connected) && !hasValidToken() // token expires after 1 h
      store.checkReminders()
    }, 20000)
    const pull = setInterval(() => document.visibilityState === 'visible' && cloud.autoSync('tick'), 60000)
    const vis = () => {
      if (document.visibilityState !== 'visible' || !store.ready) return
      store.checkReminders()
      cloud.autoSync('tick')
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(tick)
      clearInterval(pull)
      document.removeEventListener('visibilitychange', vis)
    }
  })
</script>

{#if store.ready}
  <div class="layout">
    <Sidebar bind:open={sidebarOpen} />
    <main>
      <header class="topbar">
        <button class="icon menu-btn" aria-label="Menu" onclick={() => (sidebarOpen = !sidebarOpen)}>☰</button>
        <div>
          <h1>{store.currentProject?.name}</h1>
          <p>Manage and monitor tasks</p>
        </div>
      </header>
      <Toolbar />
      {#if store.draft.layout === 'table'}<TableView />{:else}<Board />{/if}
    </main>
    <Alerts />
    {#if store.settingsOpen}<Settings />{/if}
    {#if store.openTask}<CardDetail task={store.openTask} />{/if}
  </div>
{:else}
  <div class="loading">Loading…</div>
{/if}
