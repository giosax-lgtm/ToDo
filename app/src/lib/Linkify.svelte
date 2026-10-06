<script lang="ts">
  let { text }: { text: string } = $props()

  const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

  // split() with a capture group puts the URLs at odd indexes
  const parts = $derived(text.split(URL_RE))
</script>

{#each parts as p, i}{#if i % 2}<a href={p} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>{p}</a>{:else}{p}{/if}{/each}
