<script lang="ts">
  import { store } from './store.svelte'
  import { gcal } from './gcal.svelte'
  import { cloud, SYNC_FREQ } from './cloud.svelte'
  import { exportBackup, importBackup } from './backup'
  import { onMount } from 'svelte'

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

  let persisted = $state<boolean | null>(null)
  let bpass = $state('')
  let bmsg = $state('')
  onMount(async () => { persisted = (await navigator.storage?.persisted?.()) ?? null })

  async function doExport() {
    if (bpass.length < 8) { bmsg = 'Choose a passphrase of at least 8 characters for the backup file'; return }
    const blob = await exportBackup(bpass)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `todo-backup-${new Date().toISOString().slice(0, 10)}.todo-backup.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    bmsg = 'Backup downloaded. Keep it somewhere safe, with its passphrase.'
  }

  async function doImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    if (bpass.length < 1) { bmsg = 'Enter the backup passphrase first'; return }
    if (!confirm('Importing REPLACES all data on this device with the backup. Continue?')) return
    try {
      const n = await importBackup(await f.text(), bpass)
      bmsg = `Imported ${n} records.`
    } catch (err) {
      bmsg = (err as Error).message
    }
  }

  let pass = $state('')
  let pass2 = $state('')
  let recoveryMode = $state(false)
  let saved = $state(false)

  const weak = $derived(pass.length > 0 && pass.length < 12)

  async function create() {
    if (pass.length < 12) { cloud.message = 'Use at least 12 characters (a few random words work well)'; cloud.status = 'error'; return }
    if (pass !== pass2) { cloud.message = 'The two passphrases differ'; cloud.status = 'error'; return }
    await cloud.create(pass)
    pass = pass2 = ''
  }

  async function join() {
    await cloud.join(pass, recoveryMode ? 'recovery' : 'passphrase')
    pass = ''
  }

  function resetLook() {
    for (const k of ['uiScale', 'textScale', 'font', 'colW', 'theme']) store.setPref(k, undefined)
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
      <label class="srow">Theme
        <select value={store.pref('theme', 'system')} onchange={(e) => store.setPref('theme', e.currentTarget.value)}>
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="claude">Claude theme</option>
        </select>
      </label>
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
          <button class="chip" onclick={async () => { if (await cloud.ensureAuth(true)) void gcal.sync() }}>Sync now</button>
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

    <section>
      <h3>Backup</h3>
      <small class="muted">
        Data lives in this browser's storage. Deleting "cookies and site data" erases it. Use the encrypted sync and/or a backup file.
        Persistent storage: <b>{persisted === null ? 'unknown' : persisted ? 'granted' : 'not granted (browser may evict data if the disk is full)'}</b>.
      </small>
      <label class="srow">Backup passphrase
        <input type="password" autocomplete="off" bind:value={bpass} />
      </label>
      <div class="presets">
        <button class="chip primary" onclick={doExport}>Export encrypted backup</button>
        <label class="chip filebtn">Import backup…<input type="file" accept=".json,application/json" onchange={doImport} hidden /></label>
      </div>
      {#if bmsg}<div class="gstatus">{bmsg}</div>{/if}
    </section>

    <section>
      <h3>Encrypted sync (Google Drive)</h3>
      <small class="muted">
        Your data is encrypted on this device (AES-256) before it reaches Google Drive, in a hidden app-only folder.
        Google cannot read it. Needs the Client ID above (see SETUP.md).
      </small>

      {#if cloud.recoveryKey}
        <div class="recovery">
          <b>Your recovery key — save it now (password manager or paper). It is shown only once.</b>
          <code>{cloud.recoveryKey}</code>
          <div class="presets">
            <button class="chip" onclick={() => navigator.clipboard.writeText(cloud.recoveryKey!)}>Copy</button>
          </div>
          <label class="srow row"><span>I saved the recovery key</span><input type="checkbox" bind:checked={saved} /></label>
          <button class="chip primary" disabled={!saved} onclick={() => { cloud.recoveryKey = null; saved = false }}>Done</button>
          <small class="muted">If you lose both the passphrase and this key, the synced data cannot be recovered.</small>
        </div>
      {:else if !cloud.enabled}
        <label class="srow">Passphrase (min. 12 characters)
          <input type="password" autocomplete="off" bind:value={pass} />
        </label>
        {#if weak}<small class="muted">Too short.</small>{/if}
        <label class="srow">Repeat passphrase (only to create)
          <input type="password" autocomplete="off" bind:value={pass2} />
        </label>
        <label class="srow row"><span>Unlock with recovery key instead</span><input type="checkbox" bind:checked={recoveryMode} /></label>
        <div class="presets">
          <button class="chip primary" onclick={create}>Create encrypted vault (first device)</button>
          <button class="chip" onclick={join}>Unlock existing vault (other device)</button>
        </div>
      {:else}
        <label class="srow">Sync frequency
          <select value={cloud.freq} onchange={(e) => store.setPref('syncFreq', e.currentTarget.value)}>
            {#each SYNC_FREQ as [v, l] (v)}<option value={v}>{l}</option>{/each}
          </select>
        </label>
        <small class="muted">Scheduled syncs run while the app is open (the app checks on start and every minute). Nothing runs in the background when it is closed.</small>
        <div class="presets">
          <button class="chip primary" onclick={async () => { if (await cloud.ensureAuth(true)) void cloud.sync() }}>Sync now</button>
          <button class="chip danger" onclick={() => { if (confirm('Forget the key on this device? Cloud data stays; you will need the passphrase to reconnect.')) cloud.lock() }}>Lock / forget key on this device</button>
        </div>
      {/if}

      <div class="gstatus {cloud.status}">
        {#if cloud.status === 'ok'}✓ Sync active · last sync {ago(cloud.lastSync)}
        {:else if cloud.status === 'syncing'}Syncing…
        {:else if cloud.status === 'locked'}Locked — enter the passphrase
        {:else if cloud.status === 'error'}⚠ {cloud.message}
        {:else}Sync is off{/if}
      </div>
    </section>
  </div>
</div>
