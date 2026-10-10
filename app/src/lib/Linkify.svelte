<!--
  Mostra un testo trasformando gli URL http(s) in link cliccabili (apertura in nuova scheda, senza far scattare il click sulla card).
  Usato da Card.svelte (titolo, descrizione) e CardDetail.svelte (descrizione, sottotask).
-->

<script lang="ts">
  let { text }: { text: string } = $props()

  // Riconosce URL normali e immagini markdown del tipo ![alt](https://...) o ![alt](data:image/...;base64,...).
  const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g
  const TOKEN_RE = /!\[[^\]]*\]\((?:data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]*/g

  type Part =
    | { kind: 'text'; value: string }
    | { kind: 'link'; value: string }
    | { kind: 'image'; value: string }

  const parts = $derived.by(() => {
    const out: Part[] = []
    let last = 0

    for (const match of text.matchAll(TOKEN_RE)) {
      const start = match.index ?? 0
      const value = match[0]
      if (start > last) out.push({ kind: 'text', value: text.slice(last, start) })
      if (value.startsWith('![')) {
        const src = value.match(/\((.*)\)$/)?.[1] ?? ''
        out.push({ kind: 'image', value: src })
      } else {
        out.push({ kind: 'link', value: value.replace(URL_RE, '$1') })
      }
      last = start + value.length
    }

    if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
    return out
  })
</script>

{#each parts as part}
  {#if part.kind === 'link'}
    <a href={part.value} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>{part.value}</a>
  {:else if part.kind === 'image'}
    <img src={part.value} alt="Attachment" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
  {:else}
    {part.value}
  {/if}
{/each}
