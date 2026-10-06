<!--
  SEZIONE REMINDER dentro CardDetail.svelte: elenco dei promemoria del task (data/ora, ripetizione), scorciatoie rapide (tra 1 ora, domani 9:00...) e permesso notifiche.
  Salva con store.updateTask. I reminder vengono poi mostrati da store.checkReminders() (alert + notifica di sistema) e, se Google Calendar e' collegato, inviati da gcal.svelte.ts.
  Usa toLocalInput() di lib/store.svelte.ts per il formato data.
-->

<script lang="ts">
  import { store, toLocalInput } from './store.svelte'
  import { gcal } from './gcal.svelte'
  import type { Reminder, Repeat, Task } from './types'

  let { task }: { task: Task } = $props()

  // Stato del permesso per le notifiche di sistema ('unsupported' se il browser non le offre).
  let perm = $state(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  // Opzioni di ripetizione mostrate nel menu a tendina.
  const REPEATS: [Repeat, string][] = [
    ['none', 'Once'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year'],
  ]

  // Sostituisce l'intero elenco di reminder del task.
  const set = (reminders: Reminder[]) => store.updateTask(task.id, { reminders })

  // Aggiunge un reminder all'istante indicato e con la ripetizione indicata (usata dai pulsanti rapidi).
  function add(at: Date, repeat: Repeat = 'none') {
    set([...task.reminders, { id: crypto.randomUUID(), at: toLocalInput(at), repeat, fired: false }])
  }
  // Helper per le scorciatoie: tra N ore; domani/tra N giorni/tra un mese alle 9:00.
  const inHours = (h: number) => new Date(Date.now() + h * 3600000)
  function plusDays9(n: number) { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(9, 0, 0, 0); return d }
  function plusMonth9() { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setHours(9, 0, 0, 0); return d }

  // Modifica un reminder; cambiare orario o ripetizione lo 'riarma' (fired = false) anche se era gia' scattato.
  function patch(id: string, p: Partial<Reminder>) {
    // changing the time re-arms a reminder that already fired
    set(task.reminders.map((r) => (r.id === id ? { ...r, ...p, fired: false } : r)))
  }

  // Chiede al browser il permesso per le notifiche di sistema (pulsante 'Enable system notifications').
  async function askPermission() {
    perm = await Notification.requestPermission()
  }
</script>

<div class="block reminders">
  <span class="lbl">🔔 Reminders</span>

  {#each task.reminders as r (r.id)}
    <div class="rem" class:fired={r.fired}>
      <input type="datetime-local" value={r.at} onchange={(e) => e.currentTarget.value && patch(r.id, { at: e.currentTarget.value })} />
      <select value={r.repeat} onchange={(e) => patch(r.id, { repeat: e.currentTarget.value as Repeat })}>
        {#each REPEATS as [v, l] (v)}<option value={v}>{l}</option>{/each}
      </select>
      <button class="icon" aria-label="Remove reminder" onclick={() => set(task.reminders.filter((x) => x.id !== r.id))}>✕</button>
      {#if r.fired}<small class="muted">done</small>{/if}
    </div>
  {/each}

  <div class="presets">
    <button class="chip" onclick={() => add(inHours(1))}>In 1 hour</button>
    <button class="chip" onclick={() => add(plusDays9(1))}>Tomorrow 9:00</button>
    <button class="chip" onclick={() => add(plusDays9(7))}>In 1 week</button>
    <button class="chip" onclick={() => add(plusMonth9())}>In 1 month</button>
    <button class="chip" onclick={() => add(plusMonth9(), 'monthly')}>Every month</button>
    <button class="chip" onclick={() => add(plusDays9(1))}>＋ Custom</button>
  </div>

  {#if perm === 'default'}
    <button class="chip" onclick={askPermission}>Enable system notifications</button>
  {:else if perm === 'denied'}
    <small class="muted">System notifications are blocked in the browser; reminders still appear inside the app.</small>
  {/if}
  {#if gcal.connected}
    <small class="muted">✓ Synced to your "To-Do Reminders" Google Calendar: your phone notifies you even when the app is closed.</small>
  {:else}
    <small class="muted">Reminders fire while the app is open. <button class="link" onclick={() => (store.settingsOpen = true)}>Connect Google Calendar</button> to be notified on your phone with the app closed.</small>
  {/if}
</div>
