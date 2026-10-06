<!--
  Mostra un testo trasformando gli URL http(s) in link cliccabili (apertura in nuova scheda, senza far scattare il click sulla card).
  Usato da Card.svelte (titolo, descrizione) e CardDetail.svelte (descrizione, sottotask).
-->

<script lang="ts">
  let { text }: { text: string } = $props()

  // Espressione regolare degli URL; esclude la punteggiatura finale. La cattura permette a split() di lasciare gli URL agli indici dispari.
  const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

  // Il testo spezzato in parti: indici pari = testo normale, dispari = URL (disegnati come <a>).
  // split() with a capture group puts the URLs at odd indexes
  const parts = $derived(text.split(URL_RE))
</script>

{#each parts as p, i}{#if i % 2}<a href={p} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>{p}</a>{:else}{p}{/if}{/each}
