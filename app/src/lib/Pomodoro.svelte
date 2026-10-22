<!--
  TOOL "POMODORO": timer per il lavoro concentrato (deep work). Cicli di focus + pausa breve, con pausa lunga dopo N pomodori.
  La logica del timer e' in lib/focustimer.svelte.ts (continua anche cambiando tool); qui ci sono solo comandi, durate configurabili e riepilogo.
-->

<script lang="ts">
  import { pomodoro as p, PHASE_LABEL } from './focustimer.svelte'

  const fields = [
    { key: 'work', label: 'Focus (min)', max: 180 },
    { key: 'short', label: 'Short break (min)', max: 60 },
    { key: 'long', label: 'Long break (min)', max: 90 },
    { key: 'rounds', label: 'Rounds before long break', max: 12 },
  ] as const
  const set = (key: (typeof fields)[number]['key'], max: number, e: Event) => {
    const n = Math.round(Number((e.target as HTMLInputElement).value))
    if (n >= 1) p.setCfg({ [key]: Math.min(n, max) })
  }
  const R = 90, C = 2 * Math.PI * R
</script>

<div class="pomo">
  <div class="pomo-dial" class:brk={p.phase !== 'work'}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r={R} class="p-bg" />
      <circle cx="100" cy="100" r={R} class="p-fg" stroke-dasharray={C} stroke-dashoffset={C * (1 - p.progress)} transform="rotate(-90 100 100)" />
    </svg>
    <div class="pomo-center">
      <b class="pomo-time">{p.text}</b>
      <span>{PHASE_LABEL[p.phase]} · {p.round}/{p.cfg.rounds}</span>
    </div>
  </div>

  <div class="pomo-btns">
    {#if p.running}
      <button class="chip primary strong" onclick={() => p.pause()}>⏸ Pause</button>
    {:else}
      <button class="chip primary strong" onclick={() => p.start()}>▶ {p.progress > 0 ? 'Resume' : 'Start'}</button>
    {/if}
    <button class="chip" title="Back to the full length of this phase" onclick={() => p.reset()}>↺ Reset</button>
    <button class="chip" title="Jump to the next phase" onclick={() => p.skip()}>⏭ Skip</button>
    <button class="chip" title="Back to the first focus round" onclick={() => p.restart()}>⟲ Restart cycle</button>
  </div>

  <p class="muted pomo-count">🍅 {p.doneToday} focus session{p.doneToday === 1 ? '' : 's'} completed today</p>

  <div class="pomo-cfg">
    {#each fields as f (f.key)}
      <label>{f.label}
        <input type="number" min="1" max={f.max} value={p.cfg[f.key]} disabled={p.running} onchange={(e) => set(f.key, f.max, e)} />
      </label>
    {/each}
  </div>
</div>
