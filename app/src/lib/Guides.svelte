<!--
  "GUIDE FOR PRODUCTIVITY": consigli brevi divisi per sezione, consultabili dentro Tools. Per aggiungere una guida basta aggiungere un elemento a GUIDES
  (titolo, sottotitolo e passi); non servono altre modifiche.
-->

<script lang="ts">
  interface Step { title: string; text: string }
  interface Guide { id: string; title: string; sub: string; steps: Step[]; note?: string }

  const GUIDES: Guide[] = [
    {
      id: 'system',
      title: 'The practical system in 4 steps',
      sub: 'Weekly · daily · time blocking · end of day',
      steps: [
        { title: '1. Once a week — 20 minutes', text: 'Decide which results matter this week and work out the time needed to reach them.' },
        { title: '2. Every morning — 5 minutes', text: 'Choose three priorities at most. Tell what is important apart from what merely looks urgent.' },
        { title: '3. During the day — time blocking', text: 'Put focused work, admin tasks and breaks on the calendar. Leave 20–30% of your available time free for the unexpected, if your work requires it.' },
        { title: '4. End of the day — 5 minutes', text: 'Check what you finished, what is left and which obstacle cost you time. Reschedule without treating every unfinished task as a failure.' },
      ],
      note: 'Tools that help: Eisenhower Matrix (step 1–2), MIT / 1-3-5 (step 2), Pomodoro (step 3).',
    },
    {
      id: 'pareto',
      title: 'Pareto 80/20',
      sub: 'Find the activities that produce most of your results',
      steps: [
        { title: 'The idea', text: 'Roughly 80% of results come from 20% of the causes: a few tasks, clients or habits carry most of the value.' },
        { title: '1. List', text: 'Write down everything you worked on this week or month (the finished tasks in your list are a good start).' },
        { title: '2. Rate', text: 'Next to each item note the result it produced. Which few items account for most of it?' },
        { title: '3. Protect the vital few', text: 'Give those activities your best hours: schedule them first, in the Eisenhower quadrant 2.' },
        { title: '4. Cut the rest', text: 'Delegate, batch, shrink or drop the low-yield items. Do the same for what drains your time without paying back.' },
      ],
      note: 'It is a rule of thumb, not an exact law: the real split may be 70/30 or 90/10. Review it every month.',
    },
  ]

  let openId = $state<string | null>('system')
</script>

<div class="tool-body guides">
  <p class="tool-desc">Short guides to plan better and protect your attention. Tap a guide to open it.</p>
  {#each GUIDES as g (g.id)}
    <section class="guide" class:open={openId === g.id}>
      <button class="guide-head" aria-expanded={openId === g.id} onclick={() => (openId = openId === g.id ? null : g.id)}>
        <span><b>{g.title}</b><small class="muted">{g.sub}</small></span>
        <span class="muted">{openId === g.id ? '▾' : '▸'}</span>
      </button>
      {#if openId === g.id}
        <ol class="guide-steps">
          {#each g.steps as s (s.title)}
            <li><b>{s.title}</b><p>{s.text}</p></li>
          {/each}
        </ol>
        {#if g.note}<p class="muted guide-note">{g.note}</p>{/if}
      {/if}
    </section>
  {/each}
</div>
