<!--
  TOOL "IDEAS" (idee da votare): valutazione di gruppo di idee (imprenditoriali o di qualsiasi tipo) con criteri pesati da 1 a 5.
  Ogni lavagna e' un record della tabella 'ideas' (store.ideaBoards) con i suoi criteri e le sue idee; i voti stanno dentro le idee.
  Cinque viste: Ideas (schede raggruppate per categoria), Rate (scheda e voto), Map (valore / facilita'), Ranking (classifica + CSV), Criteria (criteri e pesi).
  Calcoli in ideasmath.ts. Montato da Tools.svelte. Stili: classi "ideas-*" in app.css.
-->

<script lang="ts">
  import { store } from './store.svelte'
  import { defaultCriteria, mapPoint, newIdea, parseIdeas, ranking, rankingCsv, scoreOf, statusLabel, votedCount } from './ideasmath'
  import type { IdeaCriterion, IdeaItem } from './types'

  type View = 'ideas' | 'rate' | 'map' | 'rank' | 'criteria'
  const VIEWS: { id: View; label: string }[] = [
    { id: 'ideas', label: 'Ideas' },
    { id: 'rate', label: 'Rate' },
    { id: 'map', label: 'Map' },
    { id: 'rank', label: 'Ranking' },
    { id: 'criteria', label: 'Criteria & weights' },
  ]
  const STATUSES: IdeaItem['status'][] = ['disc', 'appr', 'ok', 'no']
  const HUES = ['#a595e4', '#72c9a6', '#f2a58c', '#76b6ea', '#ec90b3', '#ebc563']

  const board = $derived(store.ideaList.find((b) => b.id === store.pref('ideasId', '')) ?? store.ideaList[0])
  const view = $derived(store.pref<View>('ideasView', 'ideas'))
  const criteria = $derived(board?.criteria ?? [])
  const all = $derived(board?.ideas ?? [])
  const ideas = $derived(all.filter((i) => !i.removed))
  const removed = $derived(all.filter((i) => i.removed))
  const numOf = (i: IdeaItem) => all.indexOf(i) + 1
  const cats = $derived([...new Set(ideas.map((i) => i.category))])
  const hue = (c: string) => HUES[Math.max(0, [...new Set(all.map((i) => i.category))].indexOf(c)) % HUES.length]
  const fmt = (x: number | null) => (x == null ? '–' : x.toFixed(1))

  // Salvataggio: le idee e i criteri si passano per intero.
  const saveIdeas = (next: IdeaItem[]) => board && store.updateIdeaBoard(board.id, { ideas: next })
  const saveCriteria = (next: IdeaCriterion[]) => board && store.updateIdeaBoard(board.id, { criteria: next })
  const patchIdea = (id: string, p: Partial<IdeaItem>) => saveIdeas(all.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const setView = (v: View) => store.setPref('ideasView', v)

  // ---- creazione / gestione delle lavagne ----
  let creating = $state(false)
  let newTitle = $state('')
  async function createBoard() {
    const b = await store.addIdeaBoard(newTitle.trim() || 'Business ideas')
    store.setPref('ideasId', b.id)
    creating = false
    newTitle = ''
  }
  async function removeBoard() {
    if (board && confirm(`Delete the board “${board.title}” with all its ideas and votes?`)) await store.removeIdeaBoard(board.id)
  }

  // ---- vista Ideas ----
  let q = $state('')
  let fCat = $state('')
  let fStatus = $state('')
  let adding = $state(false)
  let nTitle = $state('')
  let nDesc = $state('')
  let nCat = $state('')
  let nPrompt = $state('')
  let importing = $state(false)
  let importText = $state('')
  let fileInput = $state<HTMLInputElement>()

  const shown = $derived(
    ideas.filter(
      (i) =>
        (!fCat || i.category === fCat) &&
        (!q.trim() || (i.title + ' ' + i.description).toLowerCase().includes(q.trim().toLowerCase())) &&
        (!fStatus || (fStatus === 'todo' ? votedCount(i, criteria) === 0 : i.status === fStatus)),
    ),
  )

  function addIdea() {
    const t = nTitle.trim()
    if (!t) return
    const it = newIdea(crypto.randomUUID(), t, { description: nDesc.trim(), category: nCat.trim() || 'New ideas', prompt: nPrompt.trim() })
    void saveIdeas([...all, it])
    nTitle = nDesc = nCat = nPrompt = ''
    adding = false
    open(it.id)
  }
  function importIdeas() {
    const list = parseIdeas(importText, () => crypto.randomUUID())
    if (!list.length) return
    void saveIdeas([...all, ...list])
    importText = ''
    importing = false
  }
  async function loadFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]
    if (f) importText = await f.text()
    ;(e.currentTarget as HTMLInputElement).value = ''
  }

  // ---- vista Rate ----
  const sel = $derived(ideas.find((i) => i.id === store.pref('ideasSel', '')) ?? ideas[0])
  function open(id: string) {
    store.setPref('ideasSel', id)
    setView('rate')
  }
  function step(d: number) {
    if (!sel) return
    const k = ideas.indexOf(sel)
    store.setPref('ideasSel', ideas[(k + d + ideas.length) % ideas.length].id)
  }
  const nextUnvoted = $derived(ideas.find((i) => i !== sel && votedCount(i, criteria) === 0))
  // Tocca di nuovo il voto per toglierlo.
  function rate(i: IdeaItem, c: IdeaCriterion, v: number) {
    const scores = { ...i.scores }
    if (scores[c.id] === v) delete scores[c.id]
    else scores[c.id] = v
    void patchIdea(i.id, { scores })
  }
  function removeIdea(i: IdeaItem) {
    if (confirm(`Remove “${i.title}”? You can restore it from the Ideas tab.`)) void patchIdea(i.id, { removed: true })
  }

  // ---- vista Map ----
  const pts = $derived(ideas.map((i) => ({ i, p: mapPoint(i, criteria) })).filter((x): x is { i: IdeaItem; p: { x: number; y: number } } => !!x.p))
  const MW = 640, MH = 460, ML = 46, MR = 16, MT = 14, MB = 46
  const sx = (v: number) => ML + ((v - 0.6) / 4.8) * (MW - ML - MR)
  const sy = (v: number) => MH - MB - ((v - 0.6) / 4.8) * (MH - MB - MT)
  // Bolle sovrapposte (stessa zona) vengono sparpagliate a spirale.
  const bubbles = $derived.by(() => {
    const seen: Record<string, number> = {}
    return pts.map(({ i, p }) => {
      const key = Math.round(p.x * 4) + ',' + Math.round(p.y * 4)
      const k = (seen[key] = (seen[key] ?? 0) + 1) - 1
      const ang = k * 2.4
      const rad = k ? 9 + 5 * Math.sqrt(k) : 0
      return { i, p, cx: sx(p.x) + Math.cos(ang) * rad, cy: sy(p.y) + Math.sin(ang) * rad }
    })
  })
  let tip = $state<{ i: IdeaItem; x: number; y: number; px: number; py: number } | null>(null)

  // ---- vista Ranking ----
  const ranked = $derived(ranking(ideas, criteria))
  function exportCsv() {
    const blob = new Blob(['﻿' + rankingCsv(ideas, criteria)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ideas-ranking.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // ---- vista Criteria ----
  const patchCrit = (id: string, p: Partial<IdeaCriterion>) => saveCriteria(criteria.map((c) => (c.id === id ? { ...c, ...p } : c)))
  function moveCrit(k: number, d: number) {
    const j = k + d
    if (j < 0 || j >= criteria.length) return
    const next = [...criteria]
    ;[next[k], next[j]] = [next[j], next[k]]
    void saveCriteria(next)
  }
  function addCrit() {
    void saveCriteria([...criteria, { id: crypto.randomUUID(), name: 'New criterion', hint: '', scale: '1 low · 5 high', group: 'v', w: 1 }])
  }
  function delCrit(c: IdeaCriterion) {
    if (confirm(`Delete the criterion “${c.name}”? Votes already given stay saved in the ideas but are no longer counted.`)) void saveCriteria(criteria.filter((x) => x.id !== c.id))
  }
  function resetCrit() {
    if (confirm('Replace all criteria with the initial set? Your custom criteria are removed (votes on them are no longer counted).')) void saveCriteria(defaultCriteria())
  }

  const top = $derived(ranked[0])
  const headline = $derived(
    ideas.length ? `${ideas.length} idea${ideas.length === 1 ? '' : 's'}, ${ideas.filter((i) => votedCount(i, criteria) > 0).length} rated.` + (top ? ` Leading: ${top.idea.title} (${fmt(top.score)} / 5).` : '') : '',
  )
</script>

<div class="ideas">
  <div class="rca-bar">
    {#if store.ideaList.length}
      <select aria-label="Board" value={board?.id} onchange={(e) => store.setPref('ideasId', e.currentTarget.value)}>
        {#each store.ideaList as b (b.id)}<option value={b.id}>{b.title}</option>{/each}
      </select>
    {/if}
    <button class="chip" onclick={() => (creating = true)}>+ New board</button>
    {#if board}
      <input class="rca-title" aria-label="Title" value={board.title} onchange={(e) => store.updateIdeaBoard(board.id, { title: e.currentTarget.value.trim() || board.title })} />
      <button class="chip" onclick={removeBoard} title="Delete this board">Delete board</button>
    {/if}
  </div>

  {#if creating || !store.ideaList.length}
    <div class="rca-new">
      <label class="grow">Board name
        <input placeholder="e.g. Business ideas" bind:value={newTitle} onkeydown={(e) => e.key === 'Enter' && createBoard()} />
      </label>
      <span class="rca-new-btns">
        <button class="chip primary" onclick={createBoard}>Create</button>
        {#if store.ideaList.length}<button class="chip" onclick={() => (creating = false)}>Cancel</button>{/if}
      </span>
    </div>
    {#if !store.ideaList.length}
      <p class="tool-desc">Collect ideas, rate each one from 1 to 5 on weighted criteria (impact, profit, feasibility…), see them on a value / ease map and rank them. Each board keeps its own ideas and criteria.</p>
    {/if}
  {/if}

  {#if board}
    <p class="tool-desc">{headline || 'No ideas yet: add one, or import a list.'}</p>

    <div class="ideas-tabs" role="tablist">
      {#each VIEWS as v (v.id)}
        <button class="chip" class:active={view === v.id} role="tab" aria-selected={view === v.id} onclick={() => setView(v.id)}>{v.label}</button>
      {/each}
    </div>

    {#if view === 'ideas'}
      <div class="ideas-filters">
        <input type="search" placeholder="Search ideas" aria-label="Search" bind:value={q} />
        <select aria-label="Category" bind:value={fCat}>
          <option value="">All categories</option>
          {#each cats as c (c)}<option value={c}>{c}</option>{/each}
        </select>
        <select aria-label="Status" bind:value={fStatus}>
          <option value="">All statuses</option>
          <option value="todo">Not rated</option>
          {#each STATUSES as s (s)}<option value={s}>{statusLabel(s)}</option>{/each}
        </select>
        <span class="spacer"></span>
        <button class="chip" onclick={() => (importing = !importing)}>Import</button>
        <button class="chip primary" onclick={() => (adding = !adding)}>+ New idea</button>
      </div>

      {#if adding}
        <div class="rca-new ideas-form">
          <label class="grow">Title<input maxlength="120" placeholder="e.g. Sensor for…" bind:value={nTitle} onkeydown={(e) => e.key === 'Enter' && addIdea()} /></label>
          <label class="grow">Description<textarea rows="2" maxlength="600" placeholder="What it is, for whom, which problem it solves" bind:value={nDesc}></textarea></label>
          <label>Category
            <input list="ideas-cats" maxlength="40" placeholder="pick or type a new one" bind:value={nCat} />
            <datalist id="ideas-cats">{#each cats as c (c)}<option value={c}></option>{/each}</datalist>
          </label>
          <label class="grow">Discussion prompt (optional)<input maxlength="240" bind:value={nPrompt} /></label>
          <span class="rca-new-btns">
            <button class="chip primary" onclick={addIdea} disabled={!nTitle.trim()}>Add</button>
            <button class="chip" onclick={() => (adding = false)}>Cancel</button>
          </span>
        </div>
      {/if}

      {#if importing}
        <div class="rca-new ideas-form">
          <label class="grow">Paste a list (one idea per line, or “Category: Title”) or a JSON array of {'{'}title, description, category, prompt{'}'}
            <textarea rows="5" bind:value={importText}></textarea>
          </label>
          <span class="rca-new-btns">
            <button class="chip" onclick={() => fileInput?.click()}>Choose file…</button>
            <button class="chip primary" onclick={importIdeas} disabled={!importText.trim()}>Import</button>
            <button class="chip" onclick={() => (importing = false)}>Cancel</button>
          </span>
          <input type="file" accept=".json,.txt,.csv,application/json,text/plain" hidden bind:this={fileInput} onchange={loadFile} />
        </div>
      {/if}

      {#if !shown.length}
        <p class="tool-desc">{ideas.length ? 'No idea matches the filters.' : ''}</p>
      {/if}
      {#each cats as c (c)}
        {@const g = shown.filter((i) => i.category === c)}
        {#if g.length}
          <section class="ideas-group" style:--h={hue(c)}>
            <h3>{c} <span>{g.length} idea{g.length === 1 ? '' : 's'}</span></h3>
            <div class="ideas-grid">
              {#each g as i (i.id)}
                {@const s = scoreOf(i, criteria)}
                <button class="ideas-card" class:dropped={i.status === 'no'} onclick={() => open(i.id)}>
                  <span class="ideas-ctop"><span>#{numOf(i)}</span><span class="ideas-chip"><i class="ideas-dot st-{i.status}"></i>{statusLabel(i.status)}</span></span>
                  <span class="ideas-ct">{i.title}</span>
                  <span class="ideas-cs">
                    {#if s != null}
                      <span class="ideas-bar"><i style:width="{(s / 5) * 100}%"></i></span><b>{fmt(s)}</b><span>{votedCount(i, criteria)}/{criteria.length}</span>
                    {:else}Not rated{/if}
                  </span>
                </button>
              {/each}
            </div>
          </section>
        {/if}
      {/each}

      {#if removed.length}
        <details class="ideas-removed">
          <summary>Removed ideas ({removed.length})</summary>
          {#each removed as i (i.id)}
            <div class="rca-plan-row">
              <span class="rca-plan-text">#{numOf(i)} {i.title}</span>
              <button class="chip" onclick={() => patchIdea(i.id, { removed: false })}>Restore</button>
              <button class="ei-x" aria-label="Delete for good" title="Delete for good" onclick={() => confirm(`Delete “${i.title}” for good?`) && saveIdeas(all.filter((x) => x.id !== i.id))}>✕</button>
            </div>
          {/each}
        </details>
      {/if}
    {/if}

    {#if view === 'rate'}
      {#if !sel}
        <p class="tool-desc">Add an idea first.</p>
      {:else}
        {@const s = scoreOf(sel, criteria)}
        <div class="ideas-nav">
          <button class="chip" onclick={() => step(-1)}>← Previous</button>
          <span class="tool-desc">{ideas.indexOf(sel) + 1} of {ideas.length}</span>
          <button class="chip" onclick={() => step(1)}>Next →</button>
          <span class="spacer"></span>
          <button class="chip" disabled={!nextUnvoted} onclick={() => nextUnvoted && store.setPref('ideasSel', nextUnvoted.id)}>Next to rate</button>
        </div>
        <div class="ideas-sheet">
          {#key sel.id}
            <div class="ideas-panel" style:border-top="6px solid {hue(sel.category)}">
              <div class="tool-desc">#{numOf(sel)} · {sel.category}</div>
              <input class="ideas-it" aria-label="Title" value={sel.title} maxlength="120" onchange={(e) => patchIdea(sel.id, { title: e.currentTarget.value.trim() || sel.title })} />
              <textarea rows="3" aria-label="Description" placeholder="Description" maxlength="600" value={sel.description} onchange={(e) => patchIdea(sel.id, { description: e.currentTarget.value.trim() })}></textarea>
              <label class="ideas-prompt"><b>Discussion prompt</b>
                <input value={sel.prompt} maxlength="240" placeholder="A question to open the discussion" onchange={(e) => patchIdea(sel.id, { prompt: e.currentTarget.value.trim() })} />
              </label>
              <label class="ideas-prompt"><b>Category</b>
                <input list="ideas-cats2" value={sel.category} maxlength="40" onchange={(e) => patchIdea(sel.id, { category: e.currentTarget.value.trim() || sel.category })} />
                <datalist id="ideas-cats2">{#each cats as c (c)}<option value={c}></option>{/each}</datalist>
              </label>
              <div class="ideas-seg" role="group" aria-label="Status">
                {#each STATUSES as st (st)}
                  <button class="chip" class:active={sel.status === st} onclick={() => patchIdea(sel.id, { status: st })}><i class="ideas-dot st-{st}"></i> {statusLabel(st)}</button>
                {/each}
              </div>
              <textarea rows="4" aria-label="Notes" placeholder="Discussion notes: doubts, next steps, who follows it…" value={sel.note} onchange={(e) => patchIdea(sel.id, { note: e.currentTarget.value })}></textarea>
              <div><button class="chip" onclick={() => removeIdea(sel)}>Remove idea</button></div>
            </div>
          {/key}
          <div class="ideas-panel">
            <div class="ideas-score"><div><b>Score</b><div class="tool-desc">Tap a vote again to clear it.</div></div><div class="ideas-big">{fmt(s)}<small> / 5</small></div></div>
            {#each criteria as c (c.id)}
              <div class="ideas-crit">
                <div class="ideas-crit-top"><b>{c.name}</b><span>{c.scale}</span></div>
                {#if c.hint}<div class="tool-desc">{c.hint}</div>{/if}
                <div class="ideas-rate">
                  {#each [1, 2, 3, 4, 5] as v (v)}
                    <button class="r{v}" class:on={sel.scores[c.id] === v} aria-label="{c.name} {v}" onclick={() => rate(sel, c, v)}>{v}</button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    {#if view === 'map'}
      <p class="tool-desc">{pts.length ? `${pts.length} ideas with votes on both a value and an ease criterion. Click a bubble to open its sheet. Dropped ideas are faded.` : 'Rate a few ideas (at least one value criterion and one ease criterion) and they will appear here.'}</p>
      <div class="ideas-map">
        <svg viewBox="0 0 {MW} {MH}" role="img" aria-label="Value / ease map" onmouseleave={() => (tip = null)}>
          <rect x={sx(3)} y={sy(5.4)} width={sx(5.4) - sx(3)} height={sy(3) - sy(5.4)} rx="10" fill="#72c9a6" fill-opacity=".14" />
          <rect x={sx(0.6)} y={sy(5.4)} width={sx(3) - sx(0.6)} height={sy(3) - sy(5.4)} rx="10" fill="#a595e4" fill-opacity=".14" />
          <rect x={sx(3)} y={sy(3)} width={sx(5.4) - sx(3)} height={sy(0.6) - sy(3)} rx="10" fill="#76b6ea" fill-opacity=".14" />
          <rect x={sx(0.6)} y={sy(3)} width={sx(3) - sx(0.6)} height={sy(0.6) - sy(3)} rx="10" fill="#ec90b3" fill-opacity=".14" />
          {#each [1, 2, 3, 4, 5] as v (v)}
            <line x1={sx(v)} x2={sx(v)} y1={MT} y2={MH - MB} class="im-grid" />
            <line x1={ML} x2={MW - MR} y1={sy(v)} y2={sy(v)} class="im-grid" />
            <text x={sx(v)} y={MH - MB + 16} text-anchor="middle" class="im-axis">{v}</text>
            <text x={ML - 10} y={sy(v) + 4} text-anchor="end" class="im-axis">{v}</text>
          {/each}
          <line x1={sx(3)} x2={sx(3)} y1={MT} y2={MH - MB} class="im-mid" />
          <line x1={ML} x2={MW - MR} y1={sy(3)} y2={sy(3)} class="im-mid" />
          <text x={ML + 6} y={MT + 12} class="im-q">Ambitious bets</text>
          <text x={MW - MR - 6} y={MT + 12} text-anchor="end" class="im-q">Do it now</text>
          <text x={ML + 6} y={MH - MB - 8} class="im-q">Drop</text>
          <text x={MW - MR - 6} y={MH - MB - 8} text-anchor="end" class="im-q">Easy but low value</text>
          <text x={(ML + MW - MR) / 2} y={MH - 6} text-anchor="middle" class="im-axis">Ease of making it real →</text>
          <text transform="rotate(-90)" x={-(MT + MH - MB) / 2} y="13" text-anchor="middle" class="im-axis">Value →</text>
          {#each bubbles as b (b.i.id)}
            <g class="im-pt" transform="translate({b.cx},{b.cy})" role="button" tabindex="0" aria-label={b.i.title}
              onclick={() => open(b.i.id)} onkeydown={(e) => e.key === 'Enter' && open(b.i.id)}
              onmousemove={(e) => (tip = { i: b.i, x: b.p.x, y: b.p.y, px: e.clientX, py: e.clientY })}>
              <circle r="13" fill={hue(b.i.category)} fill-opacity={b.i.status === 'no' ? 0.25 : 0.88} class:promoted={b.i.status === 'ok'} />
              <text text-anchor="middle" dy="0.35em" class="im-n">{numOf(b.i)}</text>
            </g>
          {/each}
        </svg>
        {#if tip}
          <div class="ideas-tip" style:left="{tip.px + 14}px" style:top="{tip.py + 14}px">
            <b>#{numOf(tip.i)} {tip.i.title}</b><br />Value {fmt(tip.y)} · Ease {fmt(tip.x)} · Score {fmt(scoreOf(tip.i, criteria))}
          </div>
        {/if}
      </div>
      <p class="ideas-legend">{#each [...new Set(ideas.map((i) => i.category))] as c (c)}<span><i style:background={hue(c)}></i>{c}</span>{/each}</p>
      <ul class="ideas-expl">
        <li><b>Value</b> (vertical): {criteria.filter((c) => c.group === 'v').map((c) => c.name.toLowerCase()).join(', ') || 'no criterion'}</li>
        <li><b>Ease</b> (horizontal): {criteria.filter((c) => c.group === 'e').map((c) => c.name.toLowerCase()).join(', ') || 'no criterion'}</li>
      </ul>
    {/if}

    {#if view === 'rank'}
      <div class="rca-bar">
        <span class="tool-desc">{ranked.length ? `${ranked.length} ranked${ideas.length - ranked.length ? `, ${ideas.length - ranked.length} still to rate` : ''}. Click a row to reopen its sheet.` : 'The ranking appears as soon as the first idea is rated.'}</span>
        <span class="spacer"></span>
        {#if ranked.length}<button class="chip" onclick={exportCsv}>Export CSV</button>{/if}
      </div>
      {#if ranked.length}
        <div class="ideas-table">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Idea</th><th>Score</th>
                {#each criteria as c (c.id)}<th class="num cc" title={c.name}>{c.name.split(' ')[0].slice(0, 6)}</th>{/each}
                <th>Status</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {#each ranked as r, n (r.idea.id)}
                <tr onclick={() => open(r.idea.id)}>
                  <td class="pos">{n + 1}</td>
                  <td class="ttl">{r.idea.title}<div class="tool-desc"><i class="ideas-cdot" style:background={hue(r.idea.category)}></i>{r.idea.category}</div></td>
                  <td><span class="ideas-cs"><b>{fmt(r.score)}</b><span class="ideas-bar"><i style:width="{(r.score / 5) * 100}%"></i></span></span></td>
                  {#each criteria as c (c.id)}<td class="num cc">{r.idea.scores[c.id] ?? '·'}</td>{/each}
                  <td><span class="ideas-chip"><i class="ideas-dot st-{r.idea.status}"></i>{statusLabel(r.idea.status)}</span></td>
                  <td class="note">{r.idea.note}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}

    {#if view === 'criteria'}
      <p class="tool-desc">Criteria apply to every idea of this board: edit, add or remove them and every idea is re-scored. Votes go from 1 to 5. The weight (0–3) says how much a criterion counts: 0 excludes it, 1 is normal, 3 counts triple. The score is the weighted average of the criteria that were rated. “Value” and “ease” criteria feed the two axes of the Map.</p>
      <div class="ideas-crits">
        {#each criteria as c, k (c.id)}
          <div class="ideas-crow">
            <label>Name<input value={c.name} maxlength="60" onchange={(e) => patchCrit(c.id, { name: e.currentTarget.value.trim() || 'Criterion' })} /></label>
            <label>Guiding question<input value={c.hint} maxlength="120" placeholder="What do we ask?" onchange={(e) => patchCrit(c.id, { hint: e.currentTarget.value.trim() })} /></label>
            <label>How to read the 1–5 scale<input value={c.scale} maxlength="80" placeholder="1 low · 5 high" onchange={(e) => patchCrit(c.id, { scale: e.currentTarget.value.trim() })} /></label>
            <label>Group on the map
              <select value={c.group} onchange={(e) => patchCrit(c.id, { group: e.currentTarget.value === 'e' ? 'e' : 'v' })}>
                <option value="v">Counts as value</option>
                <option value="e">Counts as ease</option>
              </select>
            </label>
            <div class="ideas-step">
              <span class="tool-desc">Weight</span>
              <button class="chip" aria-label="Less weight {c.name}" onclick={() => patchCrit(c.id, { w: Math.max(0, c.w - 1) })}>−</button>
              <output>{c.w}</output>
              <button class="chip" aria-label="More weight {c.name}" onclick={() => patchCrit(c.id, { w: Math.min(3, c.w + 1) })}>+</button>
              <button class="chip" aria-label="Move up" onclick={() => moveCrit(k, -1)}>↑</button>
              <button class="chip" aria-label="Move down" onclick={() => moveCrit(k, 1)}>↓</button>
              <button class="chip" onclick={() => delCrit(c)}>Delete</button>
            </div>
          </div>
        {/each}
      </div>
      <div class="rca-new-btns">
        <button class="chip primary" onclick={addCrit}>+ Add criterion</button>
        <button class="chip" onclick={resetCrit}>Restore initial criteria</button>
      </div>
      <p class="tool-desc">Useful questions for every idea: who is the customer and who pays? What is the first experiment we can run in a month? What already exists and why is it not enough? What is the risk that could kill the idea (technical, regulatory, market)?</p>
    {/if}
  {/if}
</div>
