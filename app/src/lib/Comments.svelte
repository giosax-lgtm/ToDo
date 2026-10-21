<!--
  ELENCO DI COMMENTI con campo di scrittura, riusato per i sotto-task (CardDetail.svelte) e per i passi (Tracker.svelte).
  Non conosce lo store: riceve i commenti e le funzioni 'onadd' / 'ondelete'. Gli stili (.cm-*) sono in app.css.
-->

<script lang="ts">
  import Linkify from './Linkify.svelte'
  import type { StepComment } from './types'

  let { comments = [], onadd, ondelete }: { comments?: StepComment[]; onadd: (text: string) => void; ondelete: (id: string) => void } = $props()

  let text = $state('')
  const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  function add() {
    if (!text.trim()) return
    onadd(text.trim())
    text = ''
  }
</script>

<div class="cm">
  {#each comments as c (c.id)}
    <div class="cm-item">
      <span class="cm-when">{when(c.at)}</span>
      <span class="cm-text"><Linkify text={c.text} /></span>
      <button class="cm-x" aria-label="Delete comment" onclick={() => ondelete(c.id)}>✕</button>
    </div>
  {/each}
  <input class="cm-in" placeholder="Add a comment, Enter" bind:value={text} onkeydown={(e) => e.key === 'Enter' && add()} />
</div>
