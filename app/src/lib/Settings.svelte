<script lang="ts">
  import { store } from './store.svelte'
  import { gcal } from './gcal.svelte'

  const FONTS: [string, string][] = [
    ['Lato, "Segoe UI", system-ui, sans-serif', 'Lato / Segoe UI (default)'],
    ['system-ui, sans-serif', 'System'],
    ['Arial, Helvetica, sans-serif', 'Arial'],
    ['Verdana, Geneva, sans-serif', 'Verdana'],
    ['"Trebuchet MS", sans-serif', 'Trebuchet'],
    ['Georgia, serif', 'Georgia (serif)'],
    ['Consolas, "Courier New", monospace', 'Consolas (mono)'],
  ]

  const close = () => (store.settingsOpen = false)
  const ago = (t: number | null) => (t ? new Date(t).toLocaleTimeString() : '—')

  function resetLook() {
    for (const k of ['uiScale', 'textScale', 'font', 'colW']) store.setPref(k, undefined)
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="overlay center" role="presentation" onclick={close}>
  <div class="modal" role="dialog" aria-label="Settings" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <div class="detail-head">
      <h2 class="grow">Settings</h2>
      <button class="icon" aria-label="Close" onclick={close}>✕</button>
    </div>

    <section>
      <h3>Appearance</h3>
      <label class="srow">Interface size <b>{store.pref('uiScale', 100)}%</b>
        <input type="range" min="70" max="150" step="5" value={store.pref('uiScale', 100)}
          oninput={(e) => store.setPref('uiScale', +e.currentTarget.value)} />
      </label>
      <label class="srow">Text size <b>{store.pref('textScale', 100)}%</b>
        <input type="range" min="80" max="160" step="5" value={store.pref('textScale', 100)}
          oninput={(e) => store.setPref('textScale', +e.currentTarget.value)} />
      </label>
      <label class="srow">Column width <b>{store.pref('colW', 290)} px</b>
        <input type="range" min="220" max="480" step="10" value={store.pref('colW', 290)}
          oninput={(e) => store.setPref('colW', +e.currentTarget.value)} />
      </label>
      <label class="srow">Font
        <select value={store.pref('font', FONTS[0][0])} onchange={(e) => store.setPref('font', e.currentTarget.value)}>
          {#each FONTS as [v, l] (v)}<option value={v}>{l}</option>{/each}
        </select>
      </label>
      <button class="chip" onclick={resetLook}>Reset appearance</button>
      <small class="muted">Side panels can also be resized by dragging their edge.</small>
    </section>

    <section>
      <h3>Google Calendar reminders</h3>
      <small class="muted">
        Each reminder becomes an event in a separate calendar "To-Do Reminders", so your phone notifies you even when the app is closed.
        See SETUP.md for how to get the Client ID.
      </small>
      <label class="srow">OAuth Client ID
        <input type="text" placeholder="123456-abc.apps.googleusercontent.com" value={store.pref('gClientId', '')}
          onchange={(e) => store.setPref('gClientId', e.currentTarget.value.trim())} />
      </label>
      <label class="srow row">
        <span>Show task titles in Google Calendar<br /><small class="muted">Off = generic "To-do reminder" (Google never sees your task text)</small></span>
        <input type="checkbox" checked={store.pref('gShowTitles', false)} onchange={(e) => store.setPref('gShowTitles', e.currentTarget.checked)} />
      </label>
      <div class="presets">
        {#if gcal.connected}
          <button class="chip primary" onclick={() => gcal.connect()}>Reconnect</button>
          <button class="chip" onclick={() => gcal.sync()}>Sync now</button>
          <button class="chip danger" onclick={() => gcal.disconnect()}>Disconnect</button>
        {:else}
          <button class="chip primary" onclick={() => gcal.connect()}>Connect Google Calendar</button>
        {/if}
      </div>
      <div class="gstatus {gcal.status}">
        {#if gcal.status === 'ok'}✓ Connected · last sync {ago(gcal.lastSync)}
        {:else if gcal.status === 'syncing'}Syncing…
        {:else if gcal.status === 'reconnect'}Sign-in expired — press Reconnect
        {:else if gcal.status === 'error'}⚠ {gcal.message}
        {:else}Not connected{/if}
        {#if gcal.status === 'reconnect' && gcal.message}<br /><small>{gcal.message}</small>{/if}
      </div>
    </section>
  </div>
</div>
