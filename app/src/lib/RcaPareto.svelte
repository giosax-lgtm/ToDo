<!--
  CORPO "PARETO" dello strumento RCA: elenco di cause con conteggio (quante volte si e' verificata ciascuna) e grafico a barre ordinato con linea della percentuale cumulata.
  Le barre fino all'80% del totale ("pochi vitali") sono colorate, le altre grigie. Ogni riga puo' aprire un 5 Perche' sulla causa. Dati in Rca.items. Montato da Rca.svelte.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { paretoRows } from './rcatables'
  import type { Rca, RcaItem } from './types'

  let { rca, onwhys }: { rca: Rca; onwhys: (text: string) => void } = $props()
  const items = $derived(rca.items ?? [])
  const rows = $derived(paretoRows(items))
  const total = $derived(rows.reduce((s, r) => s + r.n, 0))
  const save = (next: RcaItem[]) => store.updateRca(rca.id, { items: next })
  let text = $state('')
  let n = $state(1)

  function add() {
    const t = text.trim()
    if (!t) return
    void save([...items, { id: crypto.randomUUID(), text: t, n: Math.max(0, n) }])
    text = ''
    n = 1
  }
  const patch = (id: string, p: Partial<RcaItem>) => save(items.map((i) => (i.id === id ? { ...i, ...p } : i)))

  // Geometria del grafico.
  const W = 720, H = 300, L = 44, R = 44, T = 16, B = 70
  const bw = $derived(rows.length ? (W - L - R) / rows.length : 0)
  const yBar = (v: number) => T + (H - T - B) * (1 - v / (rows[0]?.n || 1))
  const yPct = (p: number) => T + (H - T - B) * (1 - p / 100)
</script>

<div class="pareto">
  <div class="ei-add">
    <input placeholder="Cause (e.g. Wrong address)…" bind:value={text} onkeydown={(e) => e.key === 'Enter' && add()} />
    <input type="number" min="0" class="pareto-n" aria-label="Count" bind:value={n} onkeydown={(e) => e.key === 'Enter' && add()} />
    <button class="chip primary" onclick={add} disabled={!text.trim()}>Add</button>
  </div>

  {#if rows.length}
    <svg class="pareto-chart" viewBox="0 0 {W} {H}" role="img" aria-label="Pareto chart">
      {#each [0, 20, 40, 60, 80, 100] as p (p)}
        <line x1={L} x2={W - R} y1={yPct(p)} y2={yPct(p)} class="pa-grid" />
        <text x={W - R + 6} y={yPct(p)} class="pa-axis" dominant-baseline="central">{p}%</text>
      {/each}
      <line x1={L} x2={W - R} y1={yPct(80)} y2={yPct(80)} class="pa-80" />
      {#each rows as r, i (r.id)}
        <rect x={L + i * bw + bw * 0.12} y={yBar(r.n)} width={bw * 0.76} height={H - B - yBar(r.n)} class="pa-bar" class:vital={r.vital} rx="3" />
        <text x={L + i * bw + bw / 2} y={yBar(r.n) - 5} class="pa-val" text-anchor="middle">{r.n}</text>
        <text x={L + i * bw + bw / 2} y={H - B + 14} class="pa-lbl" text-anchor="middle">{r.text.length > 16 ? r.text.slice(0, 15) + '…' : r.text}</text>
      {/each}
      <polyline class="pa-cum" points={rows.map((r, i) => `${L + i * bw + bw / 2},${yPct(r.cum)}`).join(' ')} />
      {#each rows as r, i (r.id)}<circle cx={L + i * bw + bw / 2} cy={yPct(r.cum)} r="3.5" class="pa-dot" />{/each}
      <text x={L - 6} y={T} class="pa-axis" text-anchor="end" dominant-baseline="central">{rows[0].n}</text>
      <text x={L - 6} y={H - B} class="pa-axis" text-anchor="end" dominant-baseline="central">0</text>
    </svg>
    <p class="rca-legend"><i class="lg vital"></i> vital few (up to 80% of {total}) <i class="lg minor"></i> the rest · focus first on the coloured bars</p>
  {:else}
    <p class="tool-desc">Add causes with how many times each happened (defects, complaints, minutes lost…). The chart sorts them and shows where the 80% is.</p>
  {/if}

  <div class="rca-plan">
    {#each [...items].sort((a, b) => b.n - a.n) as i (i.id)}
      <div class="rca-plan-row">
        <input class="pareto-t" value={i.text} aria-label="Cause" onchange={(e) => patch(i.id, { text: e.currentTarget.value.trim() || i.text })} />
        <input class="pareto-n" type="number" min="0" value={i.n} aria-label="Count" onchange={(e) => patch(i.id, { n: Math.max(0, Number(e.currentTarget.value) || 0) })} />
        <button class="chip" title="Investigate this cause with a 5 Whys" onclick={() => onwhys(i.text)}>→ 5 Whys</button>
        <button class="ei-x" aria-label="Remove" onclick={() => save(items.filter((x) => x.id !== i.id))}>✕</button>
      </div>
    {/each}
  </div>
</div>
