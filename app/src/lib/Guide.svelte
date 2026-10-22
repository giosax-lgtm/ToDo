<!--
  GUIDA DELL'APP (modale, aperta con store.guideOpen dal pulsante "Guide" della Sidebar). Capitoli brevi in inglese con schermate (app/public/guide/*.webp).
  Per aggiungere o modificare un capitolo basta cambiare l'elenco CHAPTERS; le immagini si riferiscono col solo nome del file. Le schermate sono generate
  con dati di esempio (vedi ARCHITETTURA.md, "Guida in-app"). Il testo e' in inglese come il resto dell'interfaccia.
-->

<script lang="ts">
  import { store } from './store.svelte'

  interface Shot { file: string; caption: string; narrow?: boolean }
  interface Chapter {
    id: string
    icon: string
    title: string
    intro: string
    points: string[]
    shots?: Shot[]
    tabs?: { id: string; label: string; intro: string; points: string[]; shots?: Shot[] }[]
  }

  const CHAPTERS: Chapter[] = [
    {
      id: 'start',
      icon: '🧭',
      title: 'Getting started',
      intro: 'toDo is a private kanban to-do list: columns with cards. Your data stays on your device; an encrypted copy can sync through Google Drive.',
      points: [],
      tabs: [
        {
          id: 'start',
          label: 'Overview',
          intro: 'The screen at a glance.',
          points: [
            'Left: your lists, the sync indicator and, at the bottom, Notes, Settings, Tools and this Guide.',
            'Top: the view picker, search, Edit view, Group by and Filter.',
            'Centre: the cards of the current view. Click a card to open its detail panel on the right.',
            'On a phone open the lists with ☰. Install the app from the browser menu (Install app) to use it offline.',
          ],
          shots: [{ file: 'board.webp', caption: 'A list shown as a board grouped by status.' }],
        },
        {
          id: 'lists',
          label: 'Lists',
          intro: 'A list is a project: it has its own status columns, tags, views, notes and people.',
          points: [
            'Press + next to “Lists” to create one; click a name to switch.',
            'On the selected list use ✎ to rename and 🗑 to delete (this also deletes its items).',
            'Drag the edge of the sidebar to make it wider or narrower.',
          ],
        },
      ],
    },
    {
      id: 'tasks',
      icon: '✔',
      title: 'Tasks',
      intro: 'A task (item) is a card you move across columns. Pick a topic below.',
      points: [],
      tabs: [
        {
          id: 'items',
          label: 'Items and cards',
          intro: 'An item is a task. Cards show priority, progress, reminder, due date and tags at a glance.',
          points: [
            'In a column press “+ Add item”, type a title and press Enter (opens the detail) or Ctrl+Enter (keeps adding).',
            'The new item inherits the group where you create it: status, priority, tag or due date.',
            'Drag a card to another column to change its value, or reorder inside a column.',
            'The circle on the left marks it as done. Done items are hidden unless the view shows completed items.',
          ],
        },
        {
          id: 'detail',
          label: 'Detail',
          intro: 'Click a card to edit everything about it. Close with ✕, Esc or by clicking outside.',
          points: [
            'Status, Priority (1–5 stars), Assignee, Start and Due date, Estimate in days.',
            'Milestone turns the item into a zero-length diamond on its due date.',
            'Depends on: items that must finish first. If a predecessor slips, this item moves later automatically.',
            'Description (web addresses become links) and Subtasks with their own comments.',
            'Tags for every field of the list, and Delete item at the bottom.',
          ],
          shots: [{ file: 'detail.webp', caption: 'The detail panel of an item.', narrow: true }],
        },
        {
          id: 'tracking',
          label: 'Track progress',
          intro: 'For bigger items: switch on “Track progress” to turn subtasks into steps with a status.',
          points: [
            'Each step is To do, In progress, Waiting (for someone) or Done, with an optional date and reminder.',
            'A segmented bar and a percentage appear in the detail and on the card.',
            'The Activity tab is an automatic diary: steps, status changes, due dates and your own comments.',
          ],
          shots: [{ file: 'tracking.webp', caption: 'Steps with statuses and the progress bar.', narrow: true }],
        },
        {
          id: 'tags',
          label: 'Fields and tags',
          intro: 'Fields (for example Area or Client) are your own labels; each has coloured choices called tags.',
          points: [
            'In the detail click the tags of a field to assign them; several can be chosen.',
            'Type in “+ new tag” and press Enter to create one. Use ✎ next to the field name to rename, recolour or delete tags and fields.',
            '“+ new tag field” at the bottom of the detail adds a field.',
            'Assignee is a special field: the people of the list.',
          ],
        },
        {
          id: 'reminders',
          label: 'Reminders',
          intro: 'Add reminders in the item detail; they alert you while the app is open and, with Google Calendar, also when it is closed.',
          points: [
            'Pick a shortcut (In 1 hour, Tomorrow 9:00…) or “Custom”, then choose Once, Daily, Weekly, Monthly or Yearly.',
            'When one fires you get an alert with Open, 10 min, 1 h and Tomorrow to snooze it.',
            'Connect Google Calendar in Settings to receive them on your phone even with the app closed.',
          ],
          shots: [{ file: 'reminders.webp', caption: 'Reminders of an item.', narrow: true }],
        },
      ],
    },
    {
      id: 'views',
      icon: '⚙',
      title: 'Views and layouts',
      intro: 'A view is a saved way of looking at a list. Each view can use a different layout.',
      points: [],
      tabs: [
        {
          id: 'views',
          label: 'Views and filters',
          intro: 'A view is a saved way of looking at a list: layout, grouping, filters, sort and visible fields.',
          points: [
            'The view picker (▤) switches views; ⋮ renames, sets the default or deletes one. “Save current settings as new view” creates a view.',
            'Edit view: Filter, Sort, Hide fields, Group by and Layout (Board, Table, Gantt, Dashboard), plus Show completed items.',
            'Changes are temporary until you press Save view or Save as new in the “View modified” bar; Reset undoes them.',
            'Search filters by title and description and is never saved.',
            'When grouping by status or a tag, columns can be added, renamed (double-click), recoloured, reordered (⠿) or deleted (⋯).',
          ],
          shots: [{ file: 'editview.webp', caption: 'The Edit view menu.' }],
        },
        {
          id: 'table',
          label: 'Table',
          intro: 'The same items as rows: handy for scanning and quick edits.',
          points: [
            'Change status, priority, due date and tags straight in the cells.',
            'Click a column header to sort; drag rows to reorder or move them between groups.',
          ],
          shots: [{ file: 'table.webp', caption: 'The Table layout.' }],
        },
        {
          id: 'gantt',
          label: 'Gantt',
          intro: 'A timeline: every item is a bar from its start to its due date. It needs items with dates.',
          points: [
            'Drag a bar to move it, or its left/right edge to change the start or due date. The dates are saved on the item.',
            'Arrows are dependencies (red when the next item starts too early). Diamonds are milestones. The red line is today.',
            'Set baseline freezes the current plan: a thin grey bar under each item shows slips (red when later).',
            'Days / Weeks / Months change the zoom and Today recentres. Export as PNG or PDF.',
          ],
          shots: [{ file: 'gantt.webp', caption: 'Gantt with dependencies, a milestone and a baseline.' }],
        },
        {
          id: 'dashboard',
          label: 'Dashboard',
          intro: 'Statistics of the current list; it respects the filters, search and grouping of the view.',
          points: [
            'Overall progress, counts (total, done, overdue, due in 7 days, no due date) and charts by status, due date and priority.',
            'Workload per assignee, estimates versus actual duration, baseline slippage and tracked steps.',
            'Clickable lists of overdue and upcoming items.',
          ],
          shots: [{ file: 'dashboard.webp', caption: 'The Dashboard layout.' }],
        },
      ],
    },
    {
      id: 'notes',
      icon: '📝',
      title: 'Notes',
      intro: 'Every list has an OneNote-style notebook in a floating window.',
      points: [
        'Sections (tabs) and pages (left); click anywhere on a page to start a free text box, drag it by the handle.',
        'Paste or drop images, or draw by hand with ✏. Rich formatting, lists, links and tables are available.',
        'Dock the window to the right edge with ⇥, minimise it with –, or float it again with ⧉.',
        'Export a page, a section or the whole list to Word, PDF, HTML, Markdown or text.',
      ],
      shots: [{ file: 'notes.webp', caption: 'The Notes window.' }],
    },
    {
      id: 'tools',
      icon: '🧰',
      title: 'Tools',
      intro: 'Decide what to do and manage your time. Open Tools from the sidebar; ← Back returns to your list. A fourth tab, “Guide for productivity”, holds short guides on planning and the 80/20 rule.',
      points: [],
      tabs: [
        {
          id: 'eisenhower',
          label: 'Eisenhower',
          intro: 'Sort what is on your plate by urgent and important.',
          points: [
            'Add free ideas or pick tasks of the list; drag them between quadrants (or use the small number to move them).',
            'Do quadrant 1 now, schedule quadrant 2, delegate or limit 3, drop 4.',
            '“→ To-do” turns an idea into a real task, with a priority suggested by the quadrant.',
          ],
          shots: [{ file: 'eisenhower.webp', caption: 'The Eisenhower matrix.' }],
        },
        {
          id: 'mit',
          label: 'MIT · 1-3-5',
          intro: 'Limit the day’s priorities.',
          points: [
            'MIT: pick up to 3 tasks that really matter. 1-3-5: one big, three medium and five small tasks.',
            'Each entry can be free text or a task of the list; ticking it also completes the task.',
            'It starts empty each day.',
          ],
          shots: [{ file: 'mit.webp', caption: 'MIT · 1-3-5 (the 1-3-5 mode).' }],
        },
        {
          id: 'pomodoro',
          label: 'Pomodoro',
          intro: 'A focus and break timer.',
          points: [
            'Change the focus, short break and long break lengths, and choose sound and notification.',
            'It keeps running while you browse the app; the remaining time shows in the page title and in a small timer at the top.',
          ],
          shots: [{ file: 'pomodoro.webp', caption: 'The Pomodoro timer.' }],
        },
      ],
    },
    {
      id: 'settings',
      icon: '⚙',
      title: 'Settings',
      intro: 'Open Settings from the sidebar. Pick a tab below: Appearance, Google, Sign-in server (optional), Backup and Sync.',
      points: [],
      tabs: [
        {
          id: 'look',
          label: 'Appearance',
          intro: 'Make the app comfortable for your screen and eyes.',
          points: [
            'Theme: match system, light, dark or Claude.',
            'Interface size, text size, column width and font adapt the app to your screen. Reset appearance restores the defaults.',
            'Side panels (sidebar, item detail, notes) are resized by dragging their edge.',
          ],
          shots: [{ file: 'settings-look.webp', caption: 'Settings · Appearance tab.', narrow: true }],
        },
        {
          id: 'google',
          label: 'Google',
          intro: 'Calendar reminders and Drive sync need a free Google “Client ID”. You create it once; it is not a secret and no password is shared.',
          points: [
            '1. Open console.cloud.google.com, sign in and create a project (for example “todo-app”).',
            '2. APIs & Services → Library: enable “Google Calendar API” and “Google Drive API”.',
            '3. OAuth consent screen (Google Auth platform): user type External, app name “toDo”, your email. Add the scopes calendar.app.created and drive.appdata.',
            '4. Publish the app (status “In production”). It does not need Google’s verification for personal use; at first sign-in choose Advanced → Go to toDo. In “Testing” status the consent expires every 7 days.',
            '5. Credentials → Create credentials → OAuth client ID → Web application. Under Authorized JavaScript origins add the address where you open the app (origin only, no path), for example https://yourname.github.io or http://localhost:4173. No redirect URIs are needed.',
            '6. Copy the Client ID (xxxx.apps.googleusercontent.com) into Settings → Google → OAuth Client ID, then press Connect Google Calendar and accept.',
            'The app creates its own calendar “To-Do Reminders” and only touches that calendar and a hidden app folder on Drive. Reconnect renews the sign-in, Sync now forces a sync, Recreate calendar helps if you deleted it, Disconnect removes the link.',
            '“Show task titles in Google Calendar” is off by default: Calendar shows a generic “To-do reminder” and Google never sees your task text.',
          ],
          shots: [{ file: 'settings-gcal.webp', caption: 'Settings · Google tab (example values).', narrow: true }],
        },
        {
          id: 'worker',
          label: 'Sign-in server',
          intro: 'Without it, Google’s token lasts one hour: on the next click the app opens a quick popup to renew it. A tiny free Cloudflare Worker removes this: you sign in once and the app renews itself on every device.',
          points: [
            'The Worker only holds your Google “client secret” and swaps tokens. It never sees or stores your tasks; the long-lived token stays in your browser.',
            '1. In Google Cloud Console → Credentials open your OAuth client and copy the Client secret (this is the one step where it is needed).',
            '2. Create a free Cloudflare account. In the project folder open a terminal in worker/ and run: npx wrangler login',
            '3. Edit worker/wrangler.toml: set GOOGLE_CLIENT_ID and ALLOWED_ORIGINS (the same origins you authorized in the Google tab, comma separated).',
            '4. Run npx wrangler secret put GOOGLE_CLIENT_SECRET (paste the secret), then npx wrangler deploy. It prints the address, like https://todo-auth.yourname.workers.dev.',
            '5. Paste that address into Settings → Google → Sign-in server, then press Disconnect and Connect (once per device).',
            'If you see “Google gave no long-lived login”: remove toDo at myaccount.google.com/permissions and Connect again. Keep the Google app “In production”, or the login still expires after 7 days.',
            'Disconnect, or revoking access in your Google account, ends the long-lived login.',
          ],
          shots: [{ file: 'settings-gcal.webp', caption: 'The “Sign-in server” field in the Google tab.', narrow: true }],
        },
        {
          id: 'backup',
          label: 'Backup',
          intro: 'Your data lives in this browser. Clearing “cookies and site data”, using another browser or reinstalling erases it, so keep a copy.',
          points: [
            'Choose a backup passphrase, then Export encrypted backup downloads a .todo-backup.json file. Store it together with its passphrase.',
            'Import backup… restores a file and replaces all data on this device (it asks to confirm).',
            'The tab also tells you whether the browser granted persistent storage, which protects the data if the disk is full.',
          ],
          shots: [{ file: 'settings-backup.webp', caption: 'Settings · Backup tab.', narrow: true }],
        },
        {
          id: 'sync',
          label: 'Sync',
          intro: 'Keeps several devices aligned. Data is encrypted on your device before reaching a hidden app-only folder on Drive: Google cannot read it. Requires the Client ID from the Google tab.',
          points: [
            'First device: choose a passphrase of at least 12 characters (4–5 random words work well), repeat it and press Create encrypted vault. A recovery key is shown once: save it in a password manager or on paper.',
            'Other devices: enter the Client ID and the same passphrase, then Unlock existing vault (or tick “Unlock with recovery key instead”). Best done from an empty device.',
            'Without the passphrase and the recovery key the cloud copy cannot be recovered.',
            'Sync frequency: automatic (a few seconds after each change and every minute), every 15 min / 1 h / 6 h / 1 day, or manual with Sync now. It runs only while the app is open.',
            'If two devices edit the same item together, the most recent edit wins. Lock / forget key removes the key from this device only.',
            'Sidebar dot: grey = sync off, green = synced, yellow = needs attention (click anywhere in the app to renew the sign-in, or use Reconnect in Settings).',
          ],
          shots: [{ file: 'settings-sync.webp', caption: 'Settings · Sync tab, before the vault is created.', narrow: true }],
        },
      ],
    },
  ]

  let sel = $state(CHAPTERS[0].id)
  let zoom = $state<string | null>(null)
  let pane: HTMLElement | undefined = $state()

  const chapter = $derived(CHAPTERS.find((c) => c.id === sel) ?? CHAPTERS[0])
  // sotto-schede (es. Settings): una scelta per capitolo, ricordata finche' la guida e' aperta
  let subSel = $state<Record<string, string>>({})
  const sub = $derived(chapter.tabs?.find((t) => t.id === subSel[chapter.id]) ?? chapter.tabs?.[0])
  const body = $derived(sub ?? chapter)
  const idx = $derived(CHAPTERS.findIndex((c) => c.id === chapter.id))
  const src = (f: string) => `${import.meta.env.BASE_URL}guide/${f}`

  function go(id: string) {
    sel = id
    pane?.scrollTo({ top: 0 })
  }
  function close() {
    if (zoom) zoom = null
    else store.guideOpen = false
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="overlay center" role="presentation" onclick={() => (store.guideOpen = false)}>
  <div class="modal guide-modal" role="dialog" aria-label="Guide" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <div class="row">
      <h2 class="grow">📖 Guide</h2>
      <button class="icon" aria-label="Close" onclick={() => (store.guideOpen = false)}>✕</button>
    </div>
    <div class="gm-body">
      <nav class="gm-nav" aria-label="Chapters">
        {#each CHAPTERS as c, i (c.id)}
          <button class="gm-link" class:sel={c.id === chapter.id} onclick={() => go(c.id)}><span class="gm-ico">{c.icon}</span><span><small>{i + 1}.</small> {c.title}</span></button>
        {/each}
      </nav>
      <article class="gm-pane" bind:this={pane}>
        <h3>{idx + 1}. {chapter.title}</h3>
        <p class="gm-intro">{chapter.intro}</p>
        {#if chapter.tabs}
          <div class="tabs" role="tablist">
            {#each chapter.tabs as t (t.id)}
              <button role="tab" class="tab" class:sel={t.id === sub?.id} aria-selected={t.id === sub?.id} onclick={() => { subSel[chapter.id] = t.id; pane?.scrollTo({ top: 0 }) }}>{t.label}</button>
            {/each}
          </div>
          <p class="gm-intro">{sub?.intro}</p>
        {/if}
        <ul>
          {#each body.points as p (p)}<li class:num={/^\d\. /.test(p)}>{p}</li>{/each}
        </ul>
        {#each body.shots ?? [] as shot (shot.file)}
          <figure class:narrow={shot.narrow}>
            <button class="gm-shot" aria-label="Enlarge screenshot" onclick={() => (zoom = shot.file)}>
              <img src={src(shot.file)} alt={shot.caption} loading="lazy" />
            </button>
            <figcaption class="muted">{shot.caption} · click to enlarge</figcaption>
          </figure>
        {/each}
        <div class="gm-pager">
          <button class="chip" disabled={idx === 0} onclick={() => go(CHAPTERS[idx - 1].id)}>← Previous</button>
          <button class="chip" disabled={idx === CHAPTERS.length - 1} onclick={() => go(CHAPTERS[idx + 1].id)}>Next →</button>
        </div>
      </article>
    </div>
  </div>
</div>

{#if zoom}
  <div class="gm-zoom" role="presentation" onclick={() => (zoom = null)}>
    <img src={src(zoom)} alt="Screenshot" />
  </div>
{/if}
