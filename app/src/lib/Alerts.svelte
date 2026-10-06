<!--
  BANNER DEI REMINDER SCATTATI. Mostra la lista store.alerts (riempita da store.fireAlert quando un reminder scade, vedi store.checkReminders).
  Azioni per ogni avviso: Open (apre il task in CardDetail), posticipa di 10 min / 1 h / domani (store.snooze), chiudi (store.dismissAlert).
  Montato da App.svelte; gli stili (.alerts, .alert) sono in app.css.
-->

<script lang="ts">
  import { store } from './store.svelte'
</script>

{#if store.alerts.length}
  <div class="alerts" aria-live="polite">
    {#each store.alerts as a (a.id)}
      <div class="alert">
        <div class="alert-title">🔔 {a.title}</div>
        <div class="alert-actions">
          <button class="chip primary" onclick={() => { store.openTaskId = a.taskId; store.dismissAlert(a.id) }}>Open</button>
          <button class="chip" onclick={() => store.snooze(a, 10)}>10 min</button>
          <button class="chip" onclick={() => store.snooze(a, 60)}>1 h</button>
          <button class="chip" onclick={() => store.snooze(a, 24 * 60)}>Tomorrow</button>
          <button class="icon" aria-label="Dismiss" onclick={() => store.dismissAlert(a.id)}>✕</button>
        </div>
      </div>
    {/each}
  </div>
{/if}
