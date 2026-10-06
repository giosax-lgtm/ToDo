<!--
  Etichetta colorata ('pill') per tag e opzioni. Se riceve 'onclick' diventa un pulsante (selezione nel TagPicker), altrimenti e' un semplice testo.
  Colori da lib/colors.ts. Usata da Card.svelte, TagPicker.svelte, TableView.svelte e dai filtri della Toolbar.svelte.
-->

<script lang="ts">
  import { COLORS } from './colors'
  let { label, color, onclick }: { label: string; color: string; onclick?: () => void } = $props()
  // Tinte (sfondo/testo) della chiave colore ricevuta; se non esiste usa il grigio.
  const c = $derived(COLORS[color] ?? COLORS.gray)
</script>

{#if onclick}
  <button class="pill" style:background={c.bg} style:color={c.fg} {onclick}>{label}</button>
{:else}
  <span class="pill" style:background={c.bg} style:color={c.fg}>{label}</span>
{/if}
