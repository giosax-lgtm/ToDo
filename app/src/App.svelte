<!--
  COMPONENTE RADICE dell'app (montato da src/main.ts).
  Responsabilita':
   - applica tema e preferenze di aspetto (colori, dimensione testo, larghezza colonne, font) come variabili CSS;
   - all'avvio inizializza lo store (store.init), poi i servizi Google (gcal.init, cloud.init) e fa la prima sincronizzazione;
   - gestisce i timer (controllo reminder, rinnovo token Google, sync periodica) e la sincronizzazione 'dopo ogni modifica';
   - compone il layout: Sidebar + Toolbar + (Board | TableView) + Alerts + Settings + CardDetail.
  Dipende da: lib/store.svelte.ts (dati), lib/gcal.svelte.ts (reminder su Calendar), lib/cloud.svelte.ts (sync cifrata su Drive),
  lib/google.ts (token OAuth) e da tutti i componenti in lib/*.svelte.
-->

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
  import Notes from './lib/Notes.svelte'
  import { gcal } from './lib/gcal.svelte'
  import { cloud } from './lib/cloud.svelte'
  import { hasValidToken } from './lib/google'

  let sidebarOpen = $state(false)

  // Media query del sistema operativo per il tema scuro; 'systemDark' tiene traccia del valore corrente.
  // Serve all'effetto del tema piu' sotto quando la preferenza 'theme' e' 'system'.
  // appearance prefs -> CSS variables
  // theme: light | dark | claude | system
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  let systemDark = $state(darkQuery.matches)
  // Effetto: si iscrive ai cambi di tema del sistema operativo e aggiorna 'systemDark' (si disiscrive in automatico alla distruzione).
  $effect(() => {
    const on = () => (systemDark = darkQuery.matches)
    darkQuery.addEventListener('change', on)
    return () => darkQuery.removeEventListener('change', on)
  })
  // Effetto: calcola il tema effettivo (light | dark | claude) dalla preferenza 'theme' e lo scrive in <html data-theme>.
  // I colori veri sono definiti in app.css tramite il selettore [data-theme=...].
  $effect(() => {
    const t = store.pref('theme', 'system')
    document.documentElement.dataset.theme = t === 'claude' ? 'claude' : t === 'dark' || (t === 'system' && systemDark) ? 'dark' : 'light'
  })

  // Effetto: traduce le preferenze di aspetto (uiScale, textScale, colW, font) in font-size e variabili CSS (--ts, --col-w, --font) usate da app.css.
  $effect(() => {
    const r = document.documentElement
    r.style.fontSize = (14 * store.pref('uiScale', 100)) / 100 + 'px'
    r.style.setProperty('--ts', String(store.pref('textScale', 100) / 100))
    r.style.setProperty('--col-w', store.pref('colW', 290) / 14 + 'rem')
    r.style.setProperty('--font', store.pref('font', 'Lato, "Segoe UI", system-ui, sans-serif'))
  })

  // Effetto: dopo 4 secondi di quiete dall'ultima modifica a titoli/stato/reminder dei task, spinge i reminder su Google Calendar (gcal.sync).
  // La riga JSON.stringify serve solo a far 'dipendere' l'effetto da quei campi.
  // push reminders to Google Calendar shortly after they change
  $effect(() => {
    if (!store.ready || !gcal.connected) return
    JSON.stringify(store.tasks.map((t) => [t.id, t.done, t.title, t.reminders]))
    const h = setTimeout(() => gcal.sync(), 4000)
    return () => clearTimeout(h)
  })

  // Effetto: dopo 5 secondi di quiete da una modifica locale avvia la sync cifrata su Drive (cloud.autoSync('change')).
  // store.syncEntities() viene letta per rendere l'effetto reattivo a qualsiasi dato sincronizzato.
  // encrypted cloud sync: shortly after local changes
  $effect(() => {
    if (!store.ready || !cloud.enabled) return
    store.syncEntities()
    const h = setTimeout(() => cloud.autoSync('change'), 5000)
    return () => clearTimeout(h)
  })

  // Avvio dell'app (una volta sola, a componente montato): chiede archiviazione persistente al browser, inizializza store e servizi Google,
  // controlla i reminder scaduti e lancia la prima sync. Registra anche i timer e i listener (visibilita' pagina, click) e li rimuove al termine.
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
    // Ogni 20 s: controlla i reminder scaduti (store.checkReminders) e aggiorna il flag 'authNeeded' (il token Google dura 1 ora).
    const tick = setInterval(() => {
      if (!store.ready) return
      cloud.authNeeded = (cloud.enabled || gcal.connected) && !hasValidToken() // token expires after 1 h
      store.checkReminders()
    }, 20000)
    // Ogni 60 s, se la scheda e' visibile: sync periodica (utile per le frequenze a intervallo e per scaricare le modifiche di altri dispositivi).
    const pull = setInterval(() => document.visibilityState === 'visible' && cloud.autoSync('tick'), 60000)
    // Quando la scheda torna visibile: controlla subito i reminder e sincronizza.
    const vis = () => {
      if (document.visibilityState !== 'visible' || !store.ready) return
      store.checkReminders()
      cloud.autoSync('tick')
    }
    document.addEventListener('visibilitychange', vis)
    // Google only allows its sign-in popup after a user gesture: on the first tap once the token has expired,
    // renew it right away (quick popup that closes by itself) instead of making the user dig into Settings.
    let lastAuthTry = 0
    // Al primo click dopo la scadenza del token Google: riottiene il token (popup breve, consentito perche' scatenato da un gesto dell'utente)
    // e poi risincronizza Drive e Calendar. Al massimo un tentativo ogni 2 minuti.
    const renew = () => {
      if (!store.ready || !(cloud.enabled || gcal.connected) || hasValidToken()) return
      if (Date.now() - lastAuthTry < 120000) return
      lastAuthTry = Date.now()
      void cloud.ensureAuth(true).then((ok) => {
        if (!ok) return
        void cloud.sync()
        if (gcal.connected) void gcal.sync()
      })
    }
    document.addEventListener('click', renew, true)
    return () => {
      clearInterval(tick)
      clearInterval(pull)
      document.removeEventListener('visibilitychange', vis)
      document.removeEventListener('click', renew, true)
    }
  })
</script>

<!-- Markup: finche' lo store non e' pronto mostra 'Loading…', poi il layout completo. La vista (tabella o board) dipende da store.draft.layout. -->
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
        <button class="chip notes-open" title="Open the notes of this list" onclick={() => store.setNotesWin({ open: true, min: false })}>📝 Notes</button>
      </header>
      <Toolbar />
      {#if store.draft.layout === 'table'}<TableView />{:else}<Board />{/if}
    </main>
    <Alerts />
    <Notes />
    {#if store.settingsOpen}<Settings />{/if}
    {#if store.openTask}<CardDetail task={store.openTask} />{/if}
  </div>
{:else}
  <div class="loading">Loading…</div>
{/if}
