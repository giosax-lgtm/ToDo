<!--
  Mostra un testo trasformando gli URL http(s) in link cliccabili (apertura in nuova scheda, senza far scattare il click sulla card).
  Usato da Card.svelte (titolo, descrizione) e CardDetail.svelte (descrizione, sottotask).
-->

<script lang="ts">
  let { text }: { text: string } = $props()

  type Part =
    | { kind: 'text'; value: string }
    | { kind: 'link'; value: string }
    | { kind: 'image'; value: string }

  const parts = $derived.by(() => {
    const out: Part[] = []
    let cursor = 0
    const re = /!\[[^\]]*\]\((?:data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>'")\]]+/gi

    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0
      const value = match[0]
      if (start > cursor) out.push({ kind: 'text', value: text.slice(cursor, start) })

      if (value.startsWith('![')) {
        const src = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'))
        if (src) out.push({ kind: 'image', value: src })
        else out.push({ kind: 'text', value: value })
      } else {
        out.push({ kind: 'link', value: value })
      }

      cursor = start + value.length
    }

    if (cursor < text.length) out.push({ kind: 'text', value: text.slice(cursor) })
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
