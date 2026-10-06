<script lang="ts">
  import { COLORS } from './colors'
  let { label, color, onclick }: { label: string; color: string; onclick?: () => void } = $props()
  const c = $derived(COLORS[color] ?? COLORS.gray)
</script>

{#if onclick}
  <button class="pill" style:background={c.bg} style:color={c.fg} {onclick}>{label}</button>
{:else}
  <span class="pill" style:background={c.bg} style:color={c.fg}>{label}</span>
{/if}
