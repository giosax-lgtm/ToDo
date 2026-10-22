<!--
  SEZIONE TOOLS: contenitore a schede degli strumenti per decidere cosa fare e gestire il tempo. Montata da App.svelte al posto di Toolbar + vista
  quando store.toolsOpen e' vero (pulsante "Tools" della Sidebar).
  PER AGGIUNGERE UN TOOL: creare il suo componente .svelte e aggiungere una riga a TOOLS qui sotto (id, etichetta, icona, componente, descrizione).
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { pomodoro } from './focustimer.svelte'
  import Eisenhower from './Eisenhower.svelte'
  import Pomodoro from './Pomodoro.svelte'
  import Mit from './Mit.svelte'
  import Rca from './Rca.svelte'
  import Guides from './Guides.svelte'
  import type { Component } from 'svelte'

  const TOOLS: { id: string; label: string; icon: string; comp: Component; title: string }[] = [
    { id: 'eisenhower', label: 'Eisenhower', icon: '▦', comp: Eisenhower, title: 'Eisenhower Matrix — choose priorities' },
    { id: 'mit', label: 'MIT · 1-3-5', icon: '★', comp: Mit, title: 'MIT and the 1-3-5 rule — limit priorities' },
    { id: 'pomodoro', label: 'Pomodoro', icon: '🍅', comp: Pomodoro, title: 'Pomodoro — deep work timer' },
    { id: 'rca', label: 'Root cause', icon: '🐟', comp: Rca, title: 'Root cause analysis' },
    { id: 'guides', label: 'Guide for productivity', icon: '📖', comp: Guides, title: 'Guide for productivity' },
  ]

  const active = $derived(TOOLS.find((t) => t.id === store.pref('tool', 'eisenhower')) ?? TOOLS[0])
  const Active = $derived(active.comp)
</script>

<div class="tools">
  <div class="tools-tabs" role="tablist">
    {#each TOOLS as t (t.id)}
      <button class="chip" class:active={t.id === active.id} role="tab" aria-selected={t.id === active.id} onclick={() => store.setPref('tool', t.id)}>
        {t.icon} {t.label}{#if t.id === 'pomodoro' && pomodoro.running} <small>· {pomodoro.text}</small>{/if}
      </button>
    {/each}
  </div>
  <h2 class="tools-title">{active.title}</h2>
  <Active />
</div>
