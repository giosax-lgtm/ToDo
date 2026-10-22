// STORE CENTRALE DELL'APP (stato reattivo Svelte 5 + persistenza). Esporta il singleton 'store' usato da quasi tutti i componenti.
// Contiene: i dati (liste, colonne, task, campi/tag, viste), lo stato della UI (lista e vista correnti, bozza della vista, task aperto, alert),
// le preferenze persistite, la logica di filtro/raggruppamento/ordinamento, il drag&drop (moveTask), i reminder (checkReminders) e il supporto alla sync (syncEntities/applySync).
// Persistenza: ogni modifica aggiorna prima lo stato in memoria e poi IndexedDB tramite lib/db.ts (le righe vanno convertite con plain() perche' i proxy $state non sono clonabili).
// Usato da: App.svelte e tutti i componenti lib/*.svelte, lib/cloud.svelte.ts e lib/backup.ts (sync/backup), lib/gcal.svelte.ts, lib/resizer.ts.
// Tipi in lib/types.ts, colori in lib/colors.ts.

import { SvelteMap } from 'svelte/reactivity'
import { db } from './db'
import { COLOR_KEYS } from './colors'
import { descPlain } from './desc'
import type { Column, Field, FieldOption, Group, LogEntry, MatrixItem, NoteBox, NotePage, NoteSection, NotesWin, Project, Repeat, Step, StepStatus, Task, View, ViewFilter, ViewSort } from './types'

// Genera un id univoco (UUID) per nuove entita'.
const uid = () => crypto.randomUUID()
// Converte un oggetto reattivo $state in oggetto semplice (snapshot): necessario prima di scrivere in IndexedDB o di inviare i dati alla sync.
const plain = <T>(v: T): T => $state.snapshot(v) as T
// Valore speciale 'nessuno' per filtri e gruppi (es. task senza alcun tag di un campo).
const NONE = '__none'

// Data -> 'yyyy-mm-dd' nel fuso orario LOCALE (toISOString userebbe l'UTC e sbaglierebbe giorno di notte).
const isoDay = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
// Oggi come 'yyyy-mm-dd'. Usata da dueBucket e dal gruppo 'Today' del raggruppamento per scadenza.
export const today = () => isoDay(new Date())
// Somma n giorni a una data 'yyyy-mm-dd' (calcolo in UTC, senza salti per l'ora legale).
export const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
// Giorni tra due date 'yyyy-mm-dd' (b - a).
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
// Tra n giorni come 'yyyy-mm-dd' (usata da dueBucket per la soglia 'prossimi 7 giorni').
const plusDays = (n: number) => isoDay(new Date(Date.now() + n * 86400000))

// Classifica la scadenza di un task: scaduto, oggi, prossimi 7 giorni, piu' avanti, nessuna data. Usata da valuesOf() per filtri e raggruppamento 'Due date'.
export function dueBucket(t: Task): 'overdue' | 'today' | 'week' | 'later' | 'none' {
  if (!t.due) return 'none'
  const td = today()
  if (t.due < td) return 'overdue'
  if (t.due === td) return 'today'
  if (t.due <= plusDays(7)) return 'week'
  return 'later'
}

// Numero a due cifre (zero iniziale), per formattare date e ore.
const pad = (n: number) => String(n).padStart(2, '0')
// Date -> 'yyyy-MM-ddTHH:mm' locale, formato dei campi datetime-local e dei reminder. Usata qui, da Reminders.svelte e da gcal.svelte.ts.
/** Date -> local 'yyyy-MM-ddTHH:mm' */
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

// Prossima data di un reminder ricorrente successiva a 'after' (avanza di giorno/settimana/mese/anno finche' e' nel passato). Usata da checkReminders().
export function nextOccurrence(at: string, repeat: Repeat, after = new Date()): string {
  const d = new Date(at)
  if (repeat === 'none' || isNaN(d.getTime())) return at
  while (d <= after) {
    if (repeat === 'daily') d.setDate(d.getDate() + 1)
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7)
    else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1)
    else d.setFullYear(d.getFullYear() + 1)
  }
  return toLocalInput(d)
}

// Avviso di reminder mostrato a schermo (banner in Alerts.svelte): id, task, titolo e orario.
// Per il promemoria di un passo 'stepId' e' valorizzato e 'title' contiene "task — passo".
export interface ReminderAlert { id: string; taskId: string; title: string; at: string; stepId?: string }

// Fabbrica di viste: crea una vista con valori di default, sovrascrivibili con 'o'. Usata per le viste iniziali (seedViews) e per la bozza iniziale.
const newView = (projectId: string, name: string, o: Partial<View> = {}): View => ({
  id: uid(),
  projectId,
  name,
  layout: 'board',
  groupBy: 'status',
  filters: [],
  sort: null,
  hidden: [],
  showCompleted: false,
  search: '',
  order: 0,
  ...o,
})

// Firma testuale delle impostazioni SALVABILI di una vista (la ricerca e' esclusa). Confrontando vista salvata e bozza si calcola 'dirty' (vista modificata).
/** The part of a view that counts as "saved settings" (search is transient). */
const viewSig = (v: View) =>
  JSON.stringify([v.layout, v.groupBy, v.filters, v.sort, [...v.hidden].sort(), v.showCompleted])

// Classe dello store; l'istanza unica e' 'store' in fondo al file.
class AppStore {
  // STATO osservabile: dati in memoria (specchio di IndexedDB), selezione corrente (lista, vista), bozza di vista (copia di lavoro), task aperto, alert e pannello impostazioni.
  // 'ready' diventa true quando init() ha finito (App.svelte mostra 'Loading…' fino ad allora).
  ready = $state(false)
  projects = $state<Project[]>([])
  columns = $state<Column[]>([])
  tasks = $state<Task[]>([])
  fields = $state<Field[]>([])
  options = $state<FieldOption[]>([])
  views = $state<View[]>([])
  notes = $state<NotePage[]>([])
  noteSections = $state<NoteSection[]>([])
  steps = $state<Step[]>([])
  logs = $state<LogEntry[]>([])
  matrix = $state<MatrixItem[]>([])
  currentProjectId = $state('')
  currentViewId = $state('')
  draft = $state<View>(newView('', 'Default')) // working copy of the current view
  openTaskId = $state<string | null>(null)
  alerts = $state<ReminderAlert[]>([])
  settingsOpen = $state(false)
  guideOpen = $state(false) // guida in-app (Guide.svelte), finestra modale
  toolsOpen = $state(false) // sezione Tools (Eisenhower, Pomodoro, MIT, guide) al posto della vista della lista
  private settings = new SvelteMap<string, unknown>()

  // VALORI DERIVATI (si ricalcolano da soli): lista corrente, sue colonne e viste ordinate, vista corrente, 'dirty' (bozza diversa dalla vista salvata),
  // task aperto, vista di default e 'groups' (gruppi mostrati nel board/tabella secondo il raggruppamento della bozza).
  currentProject = $derived(this.projects.find((p) => p.id === this.currentProjectId))
  projectColumns = $derived(
    this.columns.filter((c) => c.projectId === this.currentProjectId).sort((a, b) => a.order - b.order),
  )
  projectViews = $derived(
    this.views.filter((v) => v.projectId === this.currentProjectId).sort((a, b) => a.order - b.order),
  )
  currentView = $derived(this.views.find((v) => v.id === this.currentViewId))
  dirty = $derived(!!this.currentView && viewSig(this.currentView) !== viewSig(this.draft))
  openTask = $derived(this.tasks.find((t) => t.id === this.openTaskId) ?? null)
  defaultViewId = $derived(
    (this.settings.get('default:' + this.currentProjectId) as string | undefined) ?? this.projectViews[0]?.id,
  )
  groups = $derived(this.computeGroups())

  // ---------- settings ----------
  // Scrive una preferenza sia nella mappa in memoria sia in IndexedDB. Base di setPref, setWidth, vista corrente, bozza e vista di default.
  private setSetting(key: string, value: unknown) {
    this.settings.set(key, value)
    void db.settings.put({ key, value: plain(value) })
  }

  // Legge una preferenza persistita (chiavi con prefisso 'p:'), con valore di default. Usata ovunque (tema, Client ID Google, frequenza di sync...).
  /** Generic persisted preference (appearance, Google settings...). undefined resets to the default. */
  pref<T>(key: string, fallback: T): T {
    return (this.settings.get('p:' + key) as T | undefined) ?? fallback
  }
  // Scrive una preferenza persistita; undefined la elimina e ripristina il default. Usata da Settings.svelte, App.svelte, cloud e gcal.
  setPref(key: string, value: unknown) {
    if (value === undefined) {
      this.settings.delete('p:' + key)
      void db.settings.delete('p:' + key)
    } else this.setSetting('p:' + key, value)
  }

  // Legge una larghezza di pannello salvata (px). Usata da Sidebar.svelte, CardDetail.svelte e resizer.ts.
  /** Persisted UI sizes (px), e.g. sidebar and detail panel width. */
  width(key: string, fallback: number) {
    return (this.settings.get('w:' + key) as number | undefined) ?? fallback
  }
  // Salva la larghezza di un pannello (px, arrotondata). Chiamata da resizer.ts durante il trascinamento.
  setWidth(key: string, px: number) {
    this.setSetting('w:' + key, Math.round(px))
  }

  // ---------- load ----------
  // Rilegge tutte le tabelle da IndexedDB nello stato in memoria, riparando dati vecchi (order mancante, reminders assenti). Chiamata da init, applySync e wipeAll.
  /** (Re)read all data tables from IndexedDB into memory. */
  private async loadTables() {
    const [projects, columns, tasks, fields, options, views, notes, noteSections, steps, logs, matrix] = await Promise.all([
      db.projects.toArray(),
      db.columns.toArray(),
      db.tasks.toArray(),
      db.fields.toArray(),
      db.options.toArray(),
      db.views.toArray(),
      db.notes.toArray(),
      db.noteSections.toArray(),
      db.steps.toArray(),
      db.logs.toArray(),
      db.matrix.toArray(),
    ])
    this.projects = projects.sort((a, b) => a.order - b.order)
    this.columns = columns.map((c, i) => ({ ...c, order: c.order ?? i }))
    this.tasks = tasks.map((t) => ({ ...t, reminders: t.reminders ?? [] }))
    this.fields = fields.sort((a, b) => a.order - b.order)
    this.options = options.map((o, i) => ({ ...o, order: o.order ?? i }))
    this.views = views
    this.notes = notes
    this.noteSections = noteSections
    this.steps = steps
    this.logs = logs
    this.matrix = matrix
  }

  // Avvio dello store (chiamato da App.svelte): carica preferenze e dati, crea i dati iniziali se il database e' vuoto, assicura le viste per ogni lista, ripristina lista e vista dell'ultima sessione.
  async init() {
    const settings = await db.settings.toArray()
    settings.forEach((s) => !s.key.startsWith('x:') && this.settings.set(s.key, s.value)) // x: = sync internals
    await this.loadTables()
    if (!this.projects.length) await this.seed()
    await this.migrateFieldsPerProject()
    await this.ensurePeople()
    for (const p of this.projects) if (!this.views.some((v) => v.projectId === p.id)) await this.seedViews(p.id)
    const lastId = this.settings.get('currentProjectId') as string | undefined
    this.currentProjectId = this.projects.some((p) => p.id === lastId) ? lastId! : this.projects[0].id
    this.loadView()
    this.ready = true
  }

  // Dati iniziali al primo avvio: lista 'Personal' con colonne e viste di default, due campi tag ('Project', 'Scope') con una scelta ciascuno.
  private async seed() {
    const p = await this.addProject('Personal')
    const fProject = await this.addField('Project', p.id)
    const fScope = await this.addField('Scope', p.id)
    await this.addOption(fProject.id, 'Other', 'brown')
    await this.addOption(fScope.id, 'other', 'lime')
  }

  // Migrazione una tantum: i campi tag nati globali (senza projectId) vengono copiati in ogni lista, con le loro scelte; i tag dei task, i filtri/raggruppamenti/ordinamenti/campi nascosti delle viste e le bozze di ogni lista vengono riallacciati alle copie. Il primo progetto tiene gli id originali; le copie hanno id deterministici (id~lista) cosi' dispositivi diversi producono gli stessi record.
  private async migrateFieldsPerProject() {
    const legacy = this.fields.filter((f) => !f.projectId)
    if (!legacy.length || !this.projects.length) return
    const [first, ...others] = this.projects
    const newFields: Field[] = []
    const newOptions: FieldOption[] = []
    const dirtyTasks = new Set<Task>()
    const dirtyViews = new Set<View>()
    const remapView = (v: { filters: ViewFilter[]; hidden: string[]; groupBy: string; sort: ViewSort | null }, fmap: Map<string, string>, omap: Map<string, string>) => {
      for (const f of v.filters) { f.key = fmap.get(f.key) ?? f.key; f.values = f.values.map((x) => omap.get(x) ?? x) }
      v.hidden = v.hidden.map((h) => fmap.get(h) ?? h)
      v.groupBy = fmap.get(v.groupBy) ?? v.groupBy
      if (v.sort) v.sort.key = fmap.get(v.sort.key) ?? v.sort.key
    }
    for (const f of legacy) {
      f.projectId = first.id
      newFields.push(f)
      const opts = this.options.filter((o) => o.fieldId === f.id)
      for (const p of others) {
        const copy: Field = { id: `${f.id}~${p.id}`, projectId: p.id, name: f.name, order: f.order }
        newFields.push(copy)
        this.fields.push(copy)
        const omap = new Map<string, string>()
        for (const o of opts) {
          const oc: FieldOption = { ...o, id: `${o.id}~${p.id}`, fieldId: copy.id }
          omap.set(o.id, oc.id)
          newOptions.push(oc)
          this.options.push(oc)
        }
        const fmap = new Map([[f.id, copy.id]])
        for (const t of this.tasks) {
          if (t.projectId !== p.id || !(f.id in t.tags)) continue
          t.tags[copy.id] = t.tags[f.id].map((x) => omap.get(x) ?? x)
          delete t.tags[f.id]
          dirtyTasks.add(t)
        }
        for (const v of this.views) if (v.projectId === p.id) { remapView(v, fmap, omap); dirtyViews.add(v) }
        const draft = this.settings.get('draft:' + p.id) as View | undefined
        if (draft) { remapView(draft, fmap, omap); this.setSetting('draft:' + p.id, draft) }
      }
    }
    await db.transaction('rw', db.fields, db.options, db.tasks, db.views, async () => {
      await db.fields.bulkPut(plain(newFields))
      await db.options.bulkPut(plain(newOptions))
      await db.tasks.bulkPut(plain([...dirtyTasks]))
      await db.views.bulkPut(plain([...dirtyViews]))
    })
  }

  // Campi tag della lista indicata (default: quella corrente), in ordine.
  fieldsOf(projectId = this.currentProjectId) {
    return this.fields.filter((f) => f.projectId === projectId)
  }

  // ---------- cloud sync support ----------
  // Fotografia di tutti i record sincronizzabili come mappa 'tabella:id' -> dato semplice (le viste senza il testo di ricerca). Usata da cloud.svelte.ts, backup.ts e App.svelte.
  /** Every synced record, keyed "table:id". */
  syncEntities(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    const add = (table: string, list: { id: string }[]) => list.forEach((e) => (out[`${table}:${e.id}`] = plain(e)))
    add('projects', this.projects)
    add('columns', this.columns)
    add('tasks', this.tasks)
    add('fields', this.fields)
    add('options', this.options)
    add('views', this.views.map((v) => ({ ...v, search: '' })))
    add('notes', this.notes)
    add('noteSections', this.noteSections)
    add('steps', this.steps)
    add('logs', this.logs)
    add('matrix', this.matrix)
    return out
  }

  // Applica a IndexedDB le modifiche arrivate dalla sync o da un import (dato null = cancella), poi ricarica lo stato, rigenera le viste mancanti e corregge selezione/task aperto se spariti. Chiamata da cloud.run() e backup.importBackup().
  /** Write remote changes to IndexedDB (data === null deletes) and refresh the in-memory state. */
  async applySync(changes: Map<string, unknown | null>) {
    const tables = { projects: db.projects, columns: db.columns, tasks: db.tasks, fields: db.fields, options: db.options, views: db.views, notes: db.notes, noteSections: db.noteSections, steps: db.steps, logs: db.logs, matrix: db.matrix }
    const put: Record<string, unknown[]> = {}
    const del: Record<string, string[]> = {}
    for (const [key, data] of changes) {
      const i = key.indexOf(':')
      const table = key.slice(0, i)
      if (!(table in tables)) continue
      if (data === null) (del[table] ??= []).push(key.slice(i + 1))
      else (put[table] ??= []).push(data)
    }
    await db.transaction('rw', Object.values(tables), async () => {
      for (const [t, ids] of Object.entries(del)) await (tables as Record<string, { bulkDelete(k: string[]): Promise<void> }>)[t].bulkDelete(ids)
      for (const [t, rows] of Object.entries(put)) await (tables as Record<string, { bulkPut(r: unknown[]): Promise<unknown> }>)[t].bulkPut(rows)
    })
    await this.loadTables()
    await this.migrateFieldsPerProject() // dati vecchi (campi senza lista) arrivati dalla sync
    for (const p of this.projects) if (!this.views.some((v) => v.projectId === p.id)) await this.seedViews(p.id)
    if (!this.projects.some((p) => p.id === this.currentProjectId)) this.currentProjectId = this.projects[0]?.id ?? ''
    if (this.currentProjectId) this.loadView()
    if (this.openTaskId && !this.tasks.some((t) => t.id === this.openTaskId)) this.openTaskId = null
  }

  // Cancella tutti i dati locali (non le preferenze). Usata da backup.importBackup() e da cloud.join() su un dispositivo nuovo.
  /** Remove all local data (used when joining an existing cloud vault from a fresh device). */
  async wipeAll() {
    await db.transaction('rw', [db.projects, db.columns, db.tasks, db.fields, db.options, db.views, db.notes, db.noteSections, db.steps, db.logs, db.matrix], async () => {
      await Promise.all([db.projects.clear(), db.columns.clear(), db.tasks.clear(), db.fields.clear(), db.options.clear(), db.views.clear(), db.notes.clear(), db.noteSections.clear(), db.steps.clear(), db.logs.clear(), db.matrix.clear()])
    })
    await this.loadTables()
  }

  // ---------- views ----------
  // Crea le 5 viste standard di una lista (Default, Priority, Not done, Done, All items) e imposta la prima come default. Usata da init, applySync e addProject.
  private async seedViews(projectId: string) {
    const defs: View[] = [
      newView(projectId, 'Default', { order: 0 }),
      newView(projectId, 'Priority', { order: 1, groupBy: 'priority' }),
      newView(projectId, 'Not done', { order: 2, layout: 'table' }),
      newView(projectId, 'Done', {
        order: 3,
        layout: 'table',
        showCompleted: true,
        filters: [{ key: 'completed', op: 'includes', values: ['true'] }],
      }),
      newView(projectId, 'All items', { order: 4, layout: 'table', showCompleted: true }),
    ]
    this.views.push(...defs)
    await db.views.bulkPut(plain(defs))
    this.setSetting('default:' + projectId, defs[0].id)
  }

  // Carica la vista ricordata per la lista corrente (o quella di default) e la relativa bozza non salvata (se riferita alla stessa vista). Chiamata da init, selectProject e applySync.
  /** Load the remembered view (and its unsaved draft) of the current project. */
  private loadView() {
    const pid = this.currentProjectId
    const list = this.projectViews
    const wanted = this.settings.get('view:' + pid) as string | undefined
    const v = list.find((x) => x.id === wanted) ?? list.find((x) => x.id === this.defaultViewId) ?? list[0]
    this.currentViewId = v.id
    const saved = this.settings.get('draft:' + pid) as View | undefined
    this.draft = saved && saved.id === v.id ? { ...v, ...saved } : { ...structuredClone(plain(v)) }
  }

  // Passa a un'altra vista: la bozza diventa una copia della vista salvata e la scelta viene ricordata. Chiamata dal menu Views della Toolbar.
  selectView(id: string) {
    const v = this.views.find((x) => x.id === id)
    if (!v) return
    this.currentViewId = id
    this.draft = structuredClone(plain(v))
    this.setSetting('view:' + this.currentProjectId, id)
    this.setSetting('draft:' + this.currentProjectId, this.draft)
  }

  // Modifica la bozza della vista (layout, raggruppamento, filtri, ordinamento, campi nascosti, ricerca) e la ricorda. Chiamata dalla Toolbar e da TableView (ordinamento). Non salva la vista.
  updateDraft(patch: Partial<View>) {
    Object.assign(this.draft, patch)
    this.setSetting('draft:' + this.currentProjectId, this.draft)
  }

  // Scarta le modifiche non salvate tornando alla vista salvata (pulsante Reset della Toolbar).
  resetDraft() {
    if (this.currentView) this.selectView(this.currentView.id)
  }

  // Salva la bozza nella vista corrente (pulsante 'Save view').
  async saveView() {
    const v = this.currentView
    if (!v) return
    Object.assign(v, plain({ ...this.draft, id: v.id, name: v.name, order: v.order, search: '' }))
    await db.views.put(plain(v))
    this.selectView(v.id)
  }

  // Crea una nuova vista copiando la bozza attuale (pulsanti 'Save as new' e menu Views).
  async createView(name: string) {
    const v: View = {
      ...structuredClone(plain(this.draft)),
      id: uid(),
      name: name.trim() || 'New view',
      search: '',
      order: this.projectViews.length,
    }
    this.views.push(v)
    await db.views.put(plain(v))
    this.selectView(v.id)
  }

  // Rinomina una vista (menu Views).
  async renameView(id: string, name: string) {
    const v = this.views.find((x) => x.id === id)
    if (!v || !name.trim()) return
    v.name = name.trim()
    if (id === this.currentViewId) this.draft.name = v.name
    await db.views.put(plain(v))
  }

  // Elimina una vista (ne resta sempre almeno una) e, se serviva, sposta vista corrente e di default.
  async deleteView(id: string) {
    if (this.projectViews.length <= 1) return
    const wasCurrent = id === this.currentViewId
    this.views = this.views.filter((v) => v.id !== id)
    await db.views.delete(id)
    if (this.defaultViewId === id) this.setSetting('default:' + this.currentProjectId, this.projectViews[0].id)
    if (wasCurrent) this.selectView(this.defaultViewId ?? this.projectViews[0].id)
  }

  // Imposta la vista di default della lista corrente.
  setDefaultView(id: string) {
    this.setSetting('default:' + this.currentProjectId, id)
  }

  // ---------- filters ----------
  // Valori selezionabili per un filtro (stato, priorita', scadenza, completato o tag di un campo), con etichetta e colore. Usata dal menu filtri della Toolbar.
  filterOptions(key: string): { value: string; label: string; color: string }[] {
    if (key === 'status') return this.projectColumns.map((c) => ({ value: c.id, label: c.name, color: c.color }))
    if (key === 'priority')
      return [
        { value: '5', label: '★★★★★', color: 'yellow' },
        { value: '4', label: '★★★★', color: 'yellow' },
        { value: '3', label: '★★★', color: 'yellow' },
        { value: '2', label: '★★', color: 'yellow' },
        { value: '1', label: '★', color: 'yellow' },
        { value: '0', label: 'No priority', color: 'gray' },
      ]
    if (key === 'due')
      return [
        { value: 'overdue', label: 'Overdue', color: 'red' },
        { value: 'today', label: 'Today', color: 'yellow' },
        { value: 'week', label: 'Next 7 days', color: 'blue' },
        { value: 'later', label: 'Later', color: 'gray' },
        { value: 'none', label: 'No date', color: 'gray' },
      ]
    if (key === 'completed')
      return [
        { value: 'true', label: 'Done', color: 'green' },
        { value: 'false', label: 'Not done', color: 'gray' },
      ]
    return [
      ...this.fieldOptions(key).map((o) => ({ value: o.id, label: o.label, color: o.color })),
      { value: NONE, label: '(none)', color: 'gray' },
    ]
  }

  // Nome leggibile di un attributo (Status, Priority... o nome del campo tag). Usata da Toolbar.svelte per filtri, ordinamento e raggruppamento.
  filterLabel(key: string) {
    const builtin: Record<string, string> = { status: 'Status', priority: 'Priority', due: 'Due date', completed: 'Completed' }
    return builtin[key] ?? this.fields.find((f) => f.id === key)?.name ?? key
  }

  // Chiavi usabili per filtrare/raggruppare/ordinare: quelle predefinite piu' un campo per ogni campo tag.
  /** Every key usable for filter / group by / sort. */
  get attributeKeys() {
    return ['status', 'priority', 'due', 'completed', ...this.fieldsOf().map((f) => f.id)]
  }

  // Aggiunge alla bozza un filtro vuoto sull'attributo indicato (se non c'e' gia').
  addFilter(key: string) {
    if (this.draft.filters.some((f) => f.key === key)) return
    this.updateDraft({ filters: [...this.draft.filters, { key, op: 'includes', values: [] }] })
  }

  // Modifica un filtro della bozza (operatore o valori).
  setFilter(key: string, patch: Partial<ViewFilter>) {
    this.updateDraft({ filters: this.draft.filters.map((f) => (f.key === key ? { ...f, ...patch } : f)) })
  }

  // Rimuove un filtro dalla bozza.
  removeFilter(key: string) {
    this.updateDraft({ filters: this.draft.filters.filter((f) => f.key !== key) })
  }

  // Valori di un task per un attributo (colonna, priorita', fascia di scadenza, completato, tag o NONE). Base comune di filtri (matches) e raggruppamento (groupKeys).
  private valuesOf(t: Task, key: string): string[] {
    switch (key) {
      case 'status': return [t.columnId]
      case 'priority': return [String(t.priority)]
      case 'due': return [dueBucket(t)]
      case 'completed': return [String(t.done)]
      default: return t.tags[key]?.length ? t.tags[key] : [NONE]
    }
  }

  // True se un task e' visibile con la bozza corrente: completati nascosti se non richiesti, ricerca nel titolo/descrizione e tutti i filtri. Usata da groupTasks e moveTask.
  // Con 'withDone' i completati restano inclusi anche se la vista li nasconde (servono alla dashboard per le percentuali).
  matches(t: Task, withDone = false) {
    const v = this.draft
    if (t.projectId !== this.currentProjectId) return false
    if (!withDone && !v.showCompleted && t.done) return false
    const s = v.search.trim().toLowerCase()
    if (s && !(t.title + ' ' + descPlain(t.description)).toLowerCase().includes(s)) return false
    for (const f of v.filters) {
      if (!f.values.length) continue
      const have = this.valuesOf(t, f.key)
      const hit = f.values.some((x) => have.includes(x))
      if (f.op === 'includes' ? !hit : hit) return false
    }
    return true
  }

  // ---------- groups ----------
  // Le scelte (tag) di un campo, in ordine. Usata da filtri, gruppi, ordinamento e TagPicker.svelte.
  fieldOptions(fieldId: string) {
    return this.options.filter((o) => o.fieldId === fieldId).sort((a, b) => a.order - b.order)
  }

  // Costruisce i gruppi da mostrare secondo il raggruppamento della bozza (nessuno, stato, priorita', completato, scadenza o campo tag), ciascuno con la funzione 'apply'
  // che dice cosa cambia in un task quando lo si trascina li'. Alimenta il derivato 'groups' usato da Board.svelte e TableView.svelte.
  private computeGroups(): Group[] {
    const key = this.draft.groupBy
    if (key === 'none')
      return [{ key: 'all', label: 'All items', color: 'gray', editable: null, fixed: true, apply: () => ({}) }]
    if (key === 'status')
      return this.projectColumns.map((c) => ({
        key: c.id, label: c.name, color: c.color, editable: 'status' as const, apply: () => ({ columnId: c.id }),
      }))
    if (key === 'priority')
      return ([5, 4, 3, 2, 1, 0] as const).map((p) => ({
        key: String(p), label: p ? '★'.repeat(p) : 'No priority', color: p ? 'yellow' : 'gray', editable: null,
        fixed: true, apply: () => ({ priority: p }),
      }))
    if (key === 'completed')
      return [
        { key: 'false', label: 'Not done', color: 'gray', editable: null, fixed: true, apply: () => ({ done: false }) },
        { key: 'true', label: 'Done', color: 'green', editable: null, fixed: true, apply: () => ({ done: true }) },
      ]
    if (key === 'due')
      return [
        { key: 'overdue', label: 'Overdue', color: 'red', editable: null, fixed: true, apply: null },
        { key: 'today', label: 'Today', color: 'yellow', editable: null, fixed: true, apply: () => ({ due: today() }) },
        { key: 'week', label: 'Next 7 days', color: 'blue', editable: null, fixed: true, apply: null },
        { key: 'later', label: 'Later', color: 'gray', editable: null, fixed: true, apply: null },
        { key: 'none', label: 'No date', color: 'gray', editable: null, fixed: true, apply: () => ({ due: null }) },
      ]
    // tag field
    const f = this.fields.find((x) => x.id === key)
    if (!f) return []
    const set = (t: Task, ids: string[]) => ({ tags: { ...t.tags, [key]: ids } })
    return [
      ...this.fieldOptions(key).map((o) => ({
        key: o.id, label: o.label, color: o.color, editable: 'option' as const, apply: (t: Task) => set(t, [o.id]),
      })),
      { key: NONE, label: 'No ' + f.name, color: 'gray', editable: null, fixed: true, apply: (t: Task) => set(t, []) },
    ]
  }

  // In quali gruppi compare un task (un task con piu' tag puo' stare in piu' gruppi).
  groupKeys(t: Task): string[] {
    const key = this.draft.groupBy
    return key === 'none' ? ['all'] : this.valuesOf(t, key)
  }

  // Confronto per l'ordinamento: usa l'ordinamento della bozza (nome, stato, priorita', scadenza, creazione, tag) oppure l'ordine manuale (Task.order). I valori vuoti vanno in fondo.
  private compare(a: Task, b: Task): number {
    const s = this.draft.sort
    if (!s) return a.order - b.order
    const val = (t: Task): string | number | null => {
      switch (s.key) {
        case 'name': return t.title.toLowerCase()
        case 'status': return this.projectColumns.find((c) => c.id === t.columnId)?.order ?? 0
        case 'priority': return t.priority
        case 'due': return t.due
        case 'created': return t.createdAt
        default: {
          const o = this.options.find((x) => x.id === t.tags[s.key]?.[0])
          return o ? o.label.toLowerCase() : null
        }
      }
    }
    const x = val(a), y = val(b)
    if (x === null && y === null) return a.order - b.order
    if (x === null) return 1
    if (y === null) return -1
    const r = x < y ? -1 : x > y ? 1 : 0
    return (s.dir === 'asc' ? r : -r) || a.order - b.order
  }

  // I task visibili di un gruppo, ordinati. Usata da Column.svelte e TableView.svelte per disegnare le card/righe.
  groupTasks(g: Group) {
    return this.tasks.filter((t) => this.groupKeys(t).includes(g.key) && this.matches(t)).sort((a, b) => this.compare(a, b))
  }

  // Drag & drop di una card/riga (chiamata via sortable.ts da Column.svelte e TableView.svelte): se cambia gruppo applica la modifica (es. nuova colonna di stato),
  // poi, senza ordinamento attivo, ricalcola l'ordine manuale mettendo i task nascosti dai filtri dopo quelli visibili.
  /** Drag & drop: place a card in a group at a position (index among visible cards). */
  async moveTask(id: string, groupKey: string, index: number) {
    const t = this.tasks.find((x) => x.id === id)
    const g = this.groups.find((x) => x.key === groupKey)
    if (!t || !g) return
    const already = this.groupKeys(t).includes(g.key)
    if (!already) {
      const patch = g.apply?.(t)
      if (!patch) return
      const before = { columnId: t.columnId, done: t.done, due: t.due }
      Object.assign(t, patch, { updatedAt: Date.now() })
      void this.logTaskChange(t, before)
    }
    if (this.draft.sort) {
      await db.tasks.put(plain(t))
      return
    }
    const members = this.tasks.filter((x) => x.id !== id && x.projectId === t.projectId && this.groupKeys(x).includes(g.key))
    const visible = members.filter((x) => this.matches(x)).sort((a, b) => a.order - b.order)
    const hidden = members.filter((x) => !this.matches(x)).sort((a, b) => a.order - b.order)
    visible.splice(index, 0, t)
    const all = [...visible, ...hidden]
    all.forEach((x, i) => (x.order = i))
    await db.tasks.bulkPut(plain(all))
  }

  // ---------- group (column / option) editing ----------
  // Rinomina un gruppo modificabile (colonna di stato o scelta di un tag). Dal titolo colonna in Column.svelte.
  async renameGroup(g: Group, name: string) {
    const n = name.trim()
    if (!n) return
    if (g.editable === 'status') await this.updateColumn(g.key, { name: n })
    else if (g.editable === 'option') await this.updateOption(g.key, { label: n })
  }

  // Cambia colore a un gruppo modificabile (menu '...' della colonna).
  async recolorGroup(g: Group, color: string) {
    if (g.editable === 'status') await this.updateColumn(g.key, { color })
    else if (g.editable === 'option') await this.updateOption(g.key, { color })
  }

  // Elimina un gruppo modificabile (colonna o tag); vedi deleteColumn/deleteOption.
  async deleteGroup(g: Group) {
    if (g.editable === 'status') await this.deleteColumn(g.key)
    else if (g.editable === 'option') await this.deleteOption(g.key)
  }

  // Aggiunge un gruppo: nuova colonna di stato o nuova scelta del campo tag usato per il raggruppamento (pulsante '+ Add group' di Board.svelte).
  async addGroup(name: string) {
    const n = name.trim()
    if (!n) return
    const key = this.draft.groupBy
    if (key === 'status') await this.addColumn(this.currentProjectId, n)
    else if (this.fields.some((f) => f.id === key)) await this.addOption(key, n)
  }

  // True se nel raggruppamento corrente si possono aggiungere gruppi (stato o campo tag): mostra o nasconde '+ Add group'.
  get canAddGroup() {
    return this.draft.groupBy === 'status' || this.fields.some((f) => f.id === this.draft.groupBy)
  }

  // Riordina le colonne/gruppi dopo il trascinamento di una colonna (Board.svelte), salvando solo gli 'order' cambiati.
  async reorderGroup(key: string, newIndex: number) {
    const gb = this.draft.groupBy
    // start from what is displayed (not from the stored `order`, which may hold duplicates/gaps)
    const ids = this.groups.filter((g) => g.editable).map((g) => g.key)
    const from = ids.indexOf(key)
    if (from < 0) return
    ids.splice(from, 1)
    ids.splice(Math.max(0, Math.min(newIndex, ids.length)), 0, key)
    const pool: { id: string; order: number }[] = gb === 'status' ? this.projectColumns : this.fieldOptions(gb)
    const changed: { id: string; order: number }[] = []
    ids.forEach((id, n) => {
      const x = pool.find((p) => p.id === id)
      if (x && x.order !== n) { x.order = n; changed.push(x) }
    })
    if (!changed.length) return
    if (gb === 'status') await db.columns.bulkPut(plain(changed as Column[]))
    else await db.options.bulkPut(plain(changed as FieldOption[]))
  }

  // ---------- projects ----------
  // Crea una lista con le 5 colonne di stato standard e le viste standard (pulsante '+' della Sidebar).
  async addProject(name: string) {
    const p: Project = { id: uid(), name, order: this.projects.length }
    this.projects.push(p)
    await db.projects.put(plain(p))
    const defaults: [string, string][] = [
      ['Not started', 'gray'],
      ['In progress', 'purple'],
      ['Blocked', 'red'],
      ['To follow-up', 'blue'],
      ['Questions', 'yellow'],
    ]
    for (const [n, c] of defaults) await this.addColumn(p.id, n, c)
    await this.seedViews(p.id)
    await this.ensurePeople()
    return p
  }

  // Rinomina una lista (Sidebar).
  async renameProject(id: string, name: string) {
    const p = this.projects.find((x) => x.id === id)
    if (!p || !name.trim()) return
    p.name = name.trim()
    await db.projects.put(plain(p))
  }

  // Elimina una lista con colonne, task e viste (almeno una lista deve restare). Sidebar.
  async deleteProject(id: string) {
    if (this.projects.length <= 1) return
    this.projects = this.projects.filter((p) => p.id !== id)
    this.columns = this.columns.filter((c) => c.projectId !== id)
    this.tasks = this.tasks.filter((t) => t.projectId !== id)
    this.views = this.views.filter((v) => v.projectId !== id)
    this.notes = this.notes.filter((n) => n.projectId !== id)
    this.noteSections = this.noteSections.filter((n) => n.projectId !== id)
    this.steps = this.steps.filter((s) => s.projectId !== id)
    this.logs = this.logs.filter((l) => l.projectId !== id)
    this.matrix = this.matrix.filter((m) => m.projectId !== id)
    await db.transaction('rw', [db.projects, db.columns, db.tasks, db.views, db.notes, db.noteSections, db.steps, db.logs, db.matrix], async () => {
      await db.matrix.where('projectId').equals(id).delete()
      await db.steps.where('projectId').equals(id).delete()
      await db.logs.where('projectId').equals(id).delete()
      await db.projects.delete(id)
      await db.columns.where('projectId').equals(id).delete()
      await db.tasks.where('projectId').equals(id).delete()
      await db.views.where('projectId').equals(id).delete()
      await db.notes.where('projectId').equals(id).delete()
      await db.noteSections.where('projectId').equals(id).delete()
    })
    if (this.currentProjectId === id) this.selectProject(this.projects[0].id)
  }

  // Passa a un'altra lista e carica la sua vista (click sulla Sidebar).
  selectProject(id: string) {
    this.toolsOpen = false
    this.currentProjectId = id
    this.setSetting('currentProjectId', id)
    this.loadView()
  }

  // ---------- notes (quaderno note) ----------
  // Stato della finestra note (aperta/ridotta/ingrandita, posizione, dimensione), salvato come preferenza 'notesWin'. Letto e scritto da Notes.svelte, App.svelte e Sidebar.svelte.
  get notesWin(): NotesWin {
    return this.pref<NotesWin>('notesWin', { open: false, min: false, max: false, x: 80, y: 80, w: 760, h: 520, list: true, docked: false })
  }
  // Modifica parte dello stato della finestra note e lo salva.
  setNotesWin(patch: Partial<NotesWin>) {
    this.setPref('notesWin', { ...this.notesWin, ...patch })
  }

  // Sezioni della lista corrente, in ordine.
  projectSections = $derived(
    this.noteSections.filter((s) => s.projectId === this.currentProjectId).sort((a, b) => a.order - b.order),
  )

  // Pagine di una sezione, in ordine. Usata da Notes.svelte e dalle esportazioni.
  sectionPages(sectionId: string) {
    return this.notes.filter((n) => n.sectionId === sectionId).sort((a, b) => a.order - b.order)
  }

  // Crea una sezione in coda alla lista (con una prima pagina vuota, cosi' si puo' scrivere subito).
  async addSection(projectId: string, name: string) {
    const order = this.noteSections.filter((s) => s.projectId === projectId).length
    const s: NoteSection = { id: uid(), projectId, name, order }
    this.noteSections.push(s)
    await db.noteSections.put(plain(s))
    await this.addPage(s.id)
    return s
  }

  // Rinomina una sezione.
  async renameSection(id: string, name: string) {
    const s = this.noteSections.find((x) => x.id === id)
    if (!s || !name.trim()) return
    s.name = name.trim()
    await db.noteSections.put(plain(s))
  }

  // Elimina una sezione con tutte le sue pagine.
  async deleteSection(id: string) {
    this.noteSections = this.noteSections.filter((s) => s.id !== id)
    this.notes = this.notes.filter((n) => n.sectionId !== id)
    await db.transaction('rw', db.noteSections, db.notes, async () => {
      await db.noteSections.delete(id)
      await db.notes.where('sectionId').equals(id).delete()
    })
  }

  // Aggiunge una pagina vuota in coda alla sezione.
  async addPage(sectionId: string, title = '') {
    const s = this.noteSections.find((x) => x.id === sectionId)
    if (!s) throw new Error('Unknown section')
    const now = Date.now()
    const n: NotePage = {
      id: uid(), projectId: s.projectId, sectionId, title, html: '',
      order: this.notes.filter((p) => p.sectionId === sectionId).length, createdAt: now, updatedAt: now,
    }
    this.notes.push(n)
    await db.notes.put(plain(n))
    return n
  }

  // Modifica titolo e/o contenuto (caselle) di una pagina (il contenuto deve essere gia' sanitizzato).
  async updatePage(id: string, patch: Partial<Pick<NotePage, 'title' | 'html' | 'boxes'>>) {
    const n = this.notes.find((x) => x.id === id)
    if (!n) return
    Object.assign(n, patch, { updatedAt: Date.now() })
    await db.notes.put(plain(n))
  }

  // Sposta una pagina di una posizione su/giu' dentro la sua sezione.
  async movePage(id: string, dir: -1 | 1) {
    const n = this.notes.find((x) => x.id === id)
    if (!n) return
    const list = this.sectionPages(n.sectionId)
    const i = list.findIndex((p) => p.id === id)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    list.forEach((p, k) => (p.order = k))
    await db.notes.bulkPut(plain(list))
  }

  // Elimina una pagina.
  async deletePage(id: string) {
    this.notes = this.notes.filter((n) => n.id !== id)
    await db.notes.delete(id)
  }

  // ---------- columns ----------
  // Aggiunge una colonna di stato in coda alla lista.
  async addColumn(projectId: string, name: string, color = 'gray') {
    const order = this.columns.filter((c) => c.projectId === projectId).length
    const c: Column = { id: uid(), projectId, name, color, order }
    this.columns.push(c)
    await db.columns.put(plain(c))
    return c
  }

  // Modifica nome/colore di una colonna di stato.
  async updateColumn(id: string, patch: Partial<Pick<Column, 'name' | 'color'>>) {
    const c = this.columns.find((x) => x.id === id)
    if (!c) return
    Object.assign(c, patch)
    await db.columns.put(plain(c))
  }

  // Elimina una colonna spostando i suoi task nella prima colonna rimasta (ne resta sempre almeno una).
  async deleteColumn(id: string) {
    const col = this.columns.find((c) => c.id === id)
    if (!col) return
    const siblings = this.projectColumns.filter((c) => c.id !== id)
    if (!siblings.length) return // keep at least one column
    const target = siblings[0]
    const moved = this.tasks.filter((t) => t.columnId === id)
    moved.forEach((t) => (t.columnId = target.id))
    this.columns = this.columns.filter((c) => c.id !== id)
    await db.transaction('rw', db.columns, db.tasks, async () => {
      await db.columns.delete(id)
      await db.tasks.bulkPut(plain(moved))
    })
  }

  // ---------- fields & options ----------
  // Crea un nuovo campo tag (da CardDetail.svelte, 'new tag field').
  async addField(name: string, projectId = this.currentProjectId) {
    const f: Field = { id: uid(), projectId, name, order: this.fieldsOf(projectId).length }
    this.fields.push(f)
    await db.fields.put(plain(f))
    return f
  }

  // Rinomina un campo tag (TagPicker.svelte in modalita' modifica).
  async renameField(id: string, name: string) {
    const f = this.fields.find((x) => x.id === id)
    if (!f || !name.trim()) return
    f.name = name.trim()
    await db.fields.put(plain(f))
  }

  // Elimina un campo tag con tutte le sue scelte, i tag dei task e ogni riferimento nelle viste (filtri, campi nascosti, raggruppamento, ordinamento).
  async deleteField(id: string) {
    const opts = this.options.filter((o) => o.fieldId === id)
    this.fields = this.fields.filter((f) => f.id !== id)
    this.options = this.options.filter((o) => o.fieldId !== id)
    const touched: Task[] = []
    for (const t of this.tasks) if (id in t.tags) { delete t.tags[id]; touched.push(t) }
    // clean up views referencing this field
    const dirtyViews: View[] = []
    for (const v of [...this.views, this.draft]) {
      v.filters = v.filters.filter((f) => f.key !== id)
      v.hidden = v.hidden.filter((h) => h !== id)
      if (v.groupBy === id) v.groupBy = 'status'
      if (v.sort?.key === id) v.sort = null
      if (v !== this.draft) dirtyViews.push(v)
    }
    this.setSetting('draft:' + this.currentProjectId, this.draft)
    await db.transaction('rw', db.fields, db.options, db.tasks, db.views, async () => {
      await db.fields.delete(id)
      await db.options.bulkDelete(opts.map((o) => o.id))
      await db.tasks.bulkPut(plain(touched))
      await db.views.bulkPut(plain(dirtyViews))
    })
  }

  // Aggiunge una scelta (tag) a un campo; senza colore ne assegna uno a rotazione da COLOR_KEYS. Da TagPicker.svelte o addGroup.
  async addOption(fieldId: string, label: string, color?: string) {
    const n = this.options.filter((o) => o.fieldId === fieldId).length
    const o: FieldOption = {
      id: uid(), fieldId, label, order: n, color: color ?? COLOR_KEYS[(n + 1) % COLOR_KEYS.length],
    }
    this.options.push(o)
    await db.options.put(plain(o))
    return o
  }

  // Modifica etichetta/colore di una scelta di tag.
  async updateOption(id: string, patch: Partial<Pick<FieldOption, 'label' | 'color'>>) {
    const o = this.options.find((x) => x.id === id)
    if (!o) return
    Object.assign(o, patch)
    await db.options.put(plain(o))
  }

  // Elimina una scelta di tag togliendola dai task e dai filtri delle viste.
  async deleteOption(id: string) {
    const o = this.options.find((x) => x.id === id)
    if (!o) return
    this.options = this.options.filter((x) => x.id !== id)
    const touched: Task[] = []
    for (const t of this.tasks) {
      const cur = t.tags[o.fieldId]
      if (cur?.includes(id)) { t.tags[o.fieldId] = cur.filter((x) => x !== id); touched.push(t) }
    }
    const dirtyViews: View[] = []
    for (const v of [...this.views, this.draft]) {
      let changed = false
      for (const f of v.filters) if (f.values.includes(id)) { f.values = f.values.filter((x) => x !== id); changed = true }
      if (changed && v !== this.draft) dirtyViews.push(v)
    }
    this.setSetting('draft:' + this.currentProjectId, this.draft)
    await db.transaction('rw', db.options, db.tasks, db.views, async () => {
      await db.options.delete(id)
      await db.tasks.bulkPut(plain(touched))
      await db.views.bulkPut(plain(dirtyViews))
    })
  }

  // ---------- reminders ----------
  // Controlla i reminder scaduti (chiamata da App.svelte ogni 20 s, all'avvio e quando la scheda torna visibile): li mostra come alert, marca i singoli come 'fired' e sposta quelli ricorrenti alla prossima data.
  /** Show everything that is due now. Recurring reminders move to their next occurrence. */
  async checkReminders() {
    const now = new Date()
    const nowStr = toLocalInput(now)
    const changed: Task[] = []
    for (const t of this.tasks) {
      if (t.done) continue
      let touched = false
      for (const r of t.reminders) {
        if (r.fired || r.at > nowStr) continue
        this.fireAlert(t, r.at)
        touched = true
        if (r.repeat === 'none') r.fired = true
        else r.at = nextOccurrence(r.at, r.repeat, now)
      }
      if (touched) changed.push(t)
    }
    if (changed.length) await db.tasks.bulkPut(plain(changed))
    // promemoria dei passi (task con tracciamento): stessa logica, il passo fatto non scatta
    const doneTasks = new Set(this.tasks.filter((t) => t.done).map((t) => t.id))
    const stepsChanged: Step[] = []
    for (const s of this.steps) {
      const r = s.reminder
      const t = this.tasks.find((x) => x.id === s.taskId)
      if (!r || !t || r.fired || r.at > nowStr || s.status === 'done' || doneTasks.has(s.taskId)) continue
      this.fireAlert(t, r.at, s)
      r.fired = true
      stepsChanged.push(s)
      await this.addLog(t, `Reminder: ${s.text}`)
    }
    if (stepsChanged.length) await db.steps.bulkPut(plain(stepsChanged))
  }

  // Aggiunge un alert a schermo (senza duplicati) e, se permesso, una notifica di sistema (tramite service worker o Notification). Con 'step' il testo è "task — passo".
  private fireAlert(t: Task, at: string, step?: Step) {
    if (this.alerts.some((a) => a.taskId === t.id && a.at === at && a.stepId === step?.id)) return
    const title = step ? `${t.title} — ${step.text}` : t.title
    this.alerts.push({ id: uid(), taskId: t.id, title, at, stepId: step?.id })
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const opts = { body: 'Reminder', tag: step?.id ?? t.id, icon: '/favicon.svg' }
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification(title, opts))
        .catch(() => new Notification(title, opts))
    }
  }

  // Chiude un alert (Alerts.svelte).
  dismissAlert(id: string) {
    this.alerts = this.alerts.filter((a) => a.id !== id)
  }

  // Rimanda: chiude l'alert e aggiunge al task un nuovo reminder tra N minuti (pulsanti 10 min / 1 h / Tomorrow di Alerts.svelte).
  async snooze(alert: ReminderAlert, minutes: number) {
    const t = this.tasks.find((x) => x.id === alert.taskId)
    this.dismissAlert(alert.id)
    if (!t) return
    const at = toLocalInput(new Date(Date.now() + minutes * 60000))
    if (alert.stepId) { // promemoria di un passo: lo riarma a quest'ora
      await this.setStepReminder(alert.stepId, at)
      return
    }
    await this.updateTask(t.id, { reminders: [...t.reminders, { id: uid(), at, repeat: 'none', fired: false }] })
  }

  // ---------- tasks ----------
  // Crea un task nella lista corrente (prima colonna), applicando le impostazioni del gruppo in cui e' stato creato (colonna, priorita', tag...). Da Column.svelte e TableView.svelte.
  /** New item. If a group is given, the item lands in that group (status column, priority, tag...). */
  async addTask(title: string, group?: Group) {
    const first = this.projectColumns[0]
    const now = Date.now()
    const t: Task = {
      id: uid(),
      projectId: this.currentProjectId,
      columnId: first.id,
      title,
      description: '',
      priority: 0,
      due: null,
      done: false,
      tags: {},
      subtasks: [],
      reminders: [],
      order: Math.max(-1, ...this.tasks.map((x) => x.order)) + 1,
      createdAt: now,
      updatedAt: now,
    }
    if (group?.apply) Object.assign(t, group.apply(t))
    this.tasks.push(t)
    await db.tasks.put(plain(t))
    return t
  }

  // Applica una modifica parziale a un task e aggiorna 'updatedAt'. E' la funzione piu' usata dai componenti (CardDetail, Card, TableView, TagPicker, Reminders).
  async updateTask(id: string, patch: Partial<Task>) {
    const t = this.tasks.find((x) => x.id === id)
    if (!t) return
    const before = { columnId: t.columnId, done: t.done, due: t.due }
    if (patch.done !== undefined && patch.done !== t.done) patch = { ...patch, doneAt: patch.done ? today() : null }
    if (patch.milestone && !('start' in patch)) patch = { ...patch, start: patch.due ?? t.due ?? t.start ?? null }
    Object.assign(t, patch, { updatedAt: Date.now() })
    await db.tasks.put(plain(t))
    await this.logTaskChange(t, before)
    if ('start' in patch || 'due' in patch || 'deps' in patch) await this.cascade(id)
  }

  // Giorno di inizio effettivo di un task: Start date, altrimenti il giorno di creazione. Usata da Gantt, dipendenze e dashboard.
  startOf(t: Task) {
    if (t.milestone && t.due) return t.due
    if (t.start) return t.start
    return isoDay(new Date(t.createdAt))
  }

  // Dipendenze (fine -> inizio): dopo una modifica di date, i task che dipendono da 'id' non possono iniziare prima del giorno dopo la scadenza dei loro predecessori.
  // Se lo farebbero, slittano in avanti mantenendo la durata, a catena. Non anticipa mai nulla. 'seen' protegge dai cicli.
  private async cascade(id: string, seen = new Set<string>()) {
    if (seen.has(id)) return
    seen.add(id)
    for (const s of this.tasks.filter((x) => x.deps?.includes(id))) {
      const ends = (s.deps ?? []).map((d) => this.tasks.find((x) => x.id === d)?.due).filter((d): d is string => !!d)
      if (!ends.length || s.done) continue
      const need = addDays(ends.sort().at(-1)!, 1)
      const st = this.startOf(s)
      if (st >= need) continue
      const shift = daysBetween(st, need)
      const patch: Partial<Task> = { start: need, updatedAt: Date.now() }
      if (s.due) patch.due = addDays(s.due, shift)
      Object.assign(s, patch)
      await db.tasks.put(plain(s))
      await this.cascade(s.id, seen)
    }
  }

  // Task che dipendono (anche indirettamente) da 'id': servono a non proporre cicli nella scelta dei predecessori.
  descendantsOf(id: string, acc = new Set<string>()) {
    for (const s of this.tasks) if (s.deps?.includes(id) && !acc.has(s.id)) { acc.add(s.id); this.descendantsOf(s.id, acc) }
    return acc
  }

  // Baseline: "congela" le date pianificate (inizio e scadenza) di tutti i task con scadenza della lista corrente, oppure le cancella.
  async setBaseline(clear = false) {
    const list = this.tasks.filter((t) => t.projectId === this.currentProjectId && (clear ? t.baseline : t.due))
    for (const t of list) t.baseline = clear ? null : { start: this.startOf(t) <= t.due! ? this.startOf(t) : t.due!, due: t.due! }
    await db.tasks.bulkPut(plain(list))
  }

  // Campo "Assignee" (persone) di una lista; undefined se non esiste ancora.
  peopleField(projectId = this.currentProjectId) {
    return this.fields.find((f) => f.projectId === projectId && f.kind === 'people')
  }

  // Crea il campo "Assignee" in ogni lista che non l'ha (id deterministico: dispositivi diversi non creano doppioni). Se esiste gia' un campo con quel nome lo adotta.
  private async ensurePeople() {
    const changed: Field[] = []
    for (const p of this.projects) {
      if (this.peopleField(p.id)) continue
      const named = this.fields.find((f) => f.projectId === p.id && /^(assignee|assigned to|responsabile|assegnatario)$/i.test(f.name.trim()))
      if (named) { named.kind = 'people'; changed.push(named); continue }
      const f: Field = { id: 'people~' + p.id, projectId: p.id, name: 'Assignee', kind: 'people', order: 0 }
      this.fields.push(f)
      changed.push(f)
    }
    if (changed.length) await db.fields.bulkPut(plain(changed))
  }

  // Elimina un task (CardDetail.svelte, pulsante 'Delete item') insieme ai suoi passi e al suo diario.
  async deleteTask(id: string) {
    this.tasks = this.tasks.filter((t) => t.id !== id)
    this.steps = this.steps.filter((s) => s.taskId !== id)
    this.logs = this.logs.filter((l) => l.taskId !== id)
    this.matrix = this.matrix.filter((m) => m.taskId !== id)
    if (this.openTaskId === id) this.openTaskId = null
    await db.transaction('rw', db.tasks, db.steps, db.logs, db.matrix, async () => {
      await db.matrix.where('taskId').equals(id).delete()
      await db.tasks.delete(id)
      await db.steps.where('taskId').equals(id).delete()
      await db.logs.where('taskId').equals(id).delete()
    })
  }

  // ---------- matrice di Eisenhower ----------
  // Voci della matrice della lista corrente. Usata da Eisenhower.svelte.
  matrixItems = $derived(this.matrix.filter((m) => m.projectId === this.currentProjectId))
  async addMatrixItem(item: Omit<MatrixItem, 'id' | 'projectId'>) {
    const m: MatrixItem = { id: uid(), projectId: this.currentProjectId, ...item }
    this.matrix.push(m)
    await db.matrix.put(plain(m))
  }
  // Aggiorna una voce (spostamento di quadrante, collegamento a un task dopo "→ To-do").
  async updateMatrixItem(id: string, patch: Partial<Pick<MatrixItem, 'q' | 'text' | 'taskId'>>) {
    const m = this.matrix.find((x) => x.id === id)
    if (!m) return
    Object.assign(m, patch)
    await db.matrix.put(plain(m))
  }
  async removeMatrixItem(id: string) {
    this.matrix = this.matrix.filter((m) => m.id !== id)
    await db.matrix.delete(id)
  }

  // ---------- tracciamento (passi + diario) ----------
  // Passi di un task, nell'ordine manuale. Usata da Tracker.svelte.
  stepsOf(taskId: string) {
    return this.steps.filter((s) => s.taskId === taskId).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  }

  // Conteggi e percentuale di avanzamento di un task con tracciamento (fatti / totali). Usata da Card.svelte e Tracker.svelte.
  stepStats(taskId: string) {
    const list = this.steps.filter((s) => s.taskId === taskId)
    const n = (st: StepStatus) => list.filter((s) => s.status === st).length
    const done = n('done')
    return { total: list.length, done, doing: n('doing'), waiting: n('waiting'), todo: n('todo'), pct: list.length ? Math.round((done / list.length) * 100) : 0 }
  }

  // Voci del diario di un task, dalla piu' recente.
  logsOf(taskId: string) {
    return this.logs.filter((l) => l.taskId === taskId).sort((a, b) => b.at - a.at)
  }

  // Aggiunge una voce al diario (auto o commento). Ignorata se il task non ha il tracciamento attivo.
  private async addLog(t: Task, text: string, kind: LogEntry['kind'] = 'auto', at = Date.now()) {
    if (!t.track) return
    const l: LogEntry = { id: uid(), taskId: t.id, projectId: t.projectId, at, kind, text }
    this.logs.push(l)
    await db.logs.put(plain(l))
  }

  // Data 'yyyy-mm-dd' in forma breve leggibile ('20 Oct'), per il diario.
  private shortDay(d: string | null) {
    return d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'none'
  }

  // Scrive nel diario i cambiamenti del task (stato, completato, scadenza) rispetto al valore precedente. Chiamata da updateTask e moveTask; senza tracciamento non fa nulla.
  private async logTaskChange(t: Task, before: { columnId: string; done: boolean; due: string | null }) {
    if (!t.track) return
    const name = (id: string) => this.columns.find((c) => c.id === id)?.name ?? '?'
    if (t.columnId !== before.columnId) await this.addLog(t, `Status: ${name(before.columnId)} → ${name(t.columnId)}`)
    if (t.done !== before.done) await this.addLog(t, t.done ? 'Item completed' : 'Item reopened')
    if (t.due !== before.due) await this.addLog(t, `Due date: ${this.shortDay(before.due)} → ${this.shortDay(t.due)}`)
  }

  // Attiva il tracciamento: i sotto-task diventano passi (stesso id, nessuna perdita: fatto -> 'done', gli altri -> 'todo') e partono diario e avanzamento.
  async enableTracking(taskId: string) {
    const t = this.tasks.find((x) => x.id === taskId)
    if (!t || t.track) return
    const now = Date.now()
    const base = this.steps.filter((s) => s.taskId === taskId).length
    const made: Step[] = t.subtasks.map((s, i) => ({
      id: s.id, taskId, projectId: t.projectId, text: s.text, status: s.done ? 'done' : 'todo', waitingFor: '', due: null,
      comments: s.comments ?? [], statusAt: now, order: base + i, createdAt: now, updatedAt: now,
    }))
    t.subtasks = []
    t.track = true
    t.updatedAt = now
    this.steps.push(...made)
    await db.transaction('rw', db.tasks, db.steps, async () => {
      await db.tasks.put(plain(t))
      await db.steps.bulkPut(plain(made))
    })
    await this.addLog(t, made.length ? `Tracking started · ${made.length} subtask${made.length > 1 ? 's' : ''} moved to steps` : 'Tracking started')
  }

  // Disattiva il tracciamento: i passi tornano sotto-task (fatto/non fatto) e il diario resta salvato, visibile se si riattiva.
  async disableTracking(taskId: string) {
    const t = this.tasks.find((x) => x.id === taskId)
    if (!t || !t.track) return
    await this.addLog(t, 'Tracking stopped · steps moved back to subtasks')
    const mine = this.stepsOf(taskId)
    t.subtasks = [...t.subtasks, ...mine.map((s) => ({ id: s.id, text: s.text, done: s.status === 'done', comments: s.comments ?? [] }))]
    t.track = false
    t.updatedAt = Date.now()
    this.steps = this.steps.filter((s) => s.taskId !== taskId)
    await db.transaction('rw', db.tasks, db.steps, async () => {
      await db.tasks.put(plain(t))
      await db.steps.bulkDelete(mine.map((s) => s.id))
    })
  }

  // Aggiunge un passo in coda.
  async addStep(taskId: string, text: string) {
    const t = this.tasks.find((x) => x.id === taskId)
    const txt = text.trim()
    if (!t || !txt) return
    const now = Date.now()
    const order = Math.max(-1, ...this.steps.filter((s) => s.taskId === taskId).map((s) => s.order)) + 1
    const s: Step = { id: uid(), taskId, projectId: t.projectId, text: txt, status: 'todo', waitingFor: '', due: null, statusAt: now, order, createdAt: now, updatedAt: now }
    this.steps.push(s)
    await db.steps.put(plain(s))
    await this.addLog(t, `Step added: ${txt}`)
  }

  // Modifica un passo (testo, stato, "aspetto chi", scadenza) e scrive nel diario cosa e' cambiato.
  async updateStep(id: string, patch: Partial<Pick<Step, 'text' | 'status' | 'waitingFor' | 'due'>>) {
    const s = this.steps.find((x) => x.id === id)
    const t = s && this.tasks.find((x) => x.id === s.taskId)
    if (!s || !t) return
    const before = { status: s.status, waitingFor: s.waitingFor, due: s.due }
    const now = Date.now()
    Object.assign(s, patch, { updatedAt: now })
    if (s.status !== before.status) s.statusAt = now
    if (s.status !== 'waiting') s.waitingFor = ''
    await db.steps.put(plain(s))
    if (s.status !== before.status) {
      const label = { todo: 'back to to do', doing: 'in progress', waiting: 'waiting' + (s.waitingFor ? ` for ${s.waitingFor}` : ''), done: 'done' }[s.status]
      await this.addLog(t, `${s.text} → ${label}`)
    } else if (s.status === 'waiting' && s.waitingFor !== before.waitingFor) {
      await this.addLog(t, `${s.text} → waiting${s.waitingFor ? ` for ${s.waitingFor}` : ''}`)
    }
    if (s.due !== before.due) await this.addLog(t, `${s.text} · due ${this.shortDay(before.due)} → ${this.shortDay(s.due)}`)
  }

  // Imposta (o con null toglie) il promemoria di un passo. Cambiare l'orario lo riarma; l'id resta lo stesso, cosi' l'evento su Google Calendar viene aggiornato e non duplicato.
  async setStepReminder(id: string, at: string | null) {
    const s = this.steps.find((x) => x.id === id)
    const t = s && this.tasks.find((x) => x.id === s.taskId)
    if (!s || !t) return
    s.reminder = at ? { id: s.reminder?.id ?? uid(), at, repeat: 'none', fired: false } : null
    s.updatedAt = Date.now()
    await db.steps.put(plain(s))
    const when = at ? new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
    await this.addLog(t, at ? `${s.text} · reminder ${when}` : `${s.text} · reminder removed`)
  }

  // Riordina un gruppo di passi: 'ids' e' il nuovo ordine di quei passi; riusa gli stessi "posti" (valori order) che occupavano, cosi' i passi degli altri gruppi non si spostano.
  async reorderSteps(ids: string[]) {
    const subset = ids.map((id) => this.steps.find((s) => s.id === id)).filter((s): s is Step => !!s)
    const slots = subset.map((s) => s.order).sort((a, b) => a - b)
    const changed: Step[] = []
    subset.forEach((s, i) => {
      if (s.order !== slots[i]) { s.order = slots[i]; s.updatedAt = Date.now(); changed.push(s) }
    })
    if (changed.length) await db.steps.bulkPut(plain(changed))
  }

  // Aggiunge un commento a un passo; compare anche nel diario del task come commento ("Passo: testo").
  async addStepComment(id: string, text: string) {
    const s = this.steps.find((x) => x.id === id)
    const t = s && this.tasks.find((x) => x.id === s.taskId)
    const txt = text.trim()
    if (!s || !t || !txt) return
    s.comments = [...(s.comments ?? []), { id: uid(), at: Date.now(), text: txt }]
    s.updatedAt = Date.now()
    await db.steps.put(plain(s))
    await this.addLog(t, `${s.text}: ${txt}`, 'note')
  }

  // Elimina un commento di un passo (la voce gia' scritta nel diario resta, e' storia).
  async deleteStepComment(id: string, commentId: string) {
    const s = this.steps.find((x) => x.id === id)
    if (!s) return
    s.comments = (s.comments ?? []).filter((c) => c.id !== commentId)
    s.updatedAt = Date.now()
    await db.steps.put(plain(s))
  }

  // Elimina un passo.
  async deleteStep(id: string) {
    const s = this.steps.find((x) => x.id === id)
    const t = s && this.tasks.find((x) => x.id === s.taskId)
    if (!s || !t) return
    this.steps = this.steps.filter((x) => x.id !== id)
    await db.steps.delete(id)
    await this.addLog(t, `Step removed: ${s.text}`)
  }

  // Aggiunge un commento scritto dall'utente al diario ("cosa sto facendo").
  async addNote(taskId: string, text: string) {
    const t = this.tasks.find((x) => x.id === taskId)
    const txt = text.trim()
    if (t && txt) await this.addLog(t, txt, 'note')
  }

  // Elimina una voce del diario (solo i commenti sono eliminabili dall'interfaccia).
  async deleteLog(id: string) {
    this.logs = this.logs.filter((l) => l.id !== id)
    await db.logs.delete(id)
  }
}

// Istanza unica dello store, importata da tutta l'app.
export const store = new AppStore()
