<!--
  CORPO "IS / IS-NOT" (Kepner-Tregoe) dello strumento RCA: tabella che confronta cio' che il problema E' e NON E' (cosa, dove, quando, quanto) e annota le differenze.
  Serve a restringere il campo prima di cercare le cause. Le celle sono salvate in Rca.grid (chiave "<riga>.<colonna>"). Montato da Rca.svelte.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { cellKey, ISNOT_COLS, ISNOT_ROWS } from './rcatables'
  import type { Rca } from './types'

  let { rca, onwhys }: { rca: Rca; onwhys: () => void } = $props()
  const set = (row: number, col: string, v: string) => store.updateRca(rca.id, { grid: { ...(rca.grid ?? {}), [cellKey(row, col)]: v } })
  // La textarea cresce con il testo.
  function grow(node: HTMLTextAreaElement) {
    const fit = () => { node.style.height = 'auto'; node.style.height = `${node.scrollHeight + 2}px` }
    fit()
    node.addEventListener('input', fit)
    return { destroy() { node.removeEventListener('input', fit) } }
  }
</script>

<div class="isnot">
  <div class="isnot-head"><span></span>
    {#each ISNOT_COLS as c (c.key)}<div class="isnot-col {c.key}"><b>{c.title}</b><small>{c.sub}</small></div>{/each}
  </div>
  {#each ISNOT_ROWS as r, i (i)}
    <div class="isnot-row">
      <div class="isnot-q"><b>{r.dim}</b><small>{r.q}</small></div>
      {#each ISNOT_COLS as c (c.key)}
        <textarea class="isnot-cell {c.key}" rows="2" aria-label="{r.dim} {r.q} {c.title}" value={rca.grid?.[cellKey(i, c.key)] ?? ''} use:grow
          onchange={(e) => set(i, c.key, e.currentTarget.value)}></textarea>
      {/each}
    </div>
  {/each}
  <div class="rca-bar"><button class="chip primary" onclick={onwhys}>→ Start a 5 Whys from this</button>
    <small class="muted">The “distinctive / what changed” column is where the causes hide: take each one as a starting point.</small></div>
</div>
