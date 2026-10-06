import { SvelteMap } from 'svelte/reactivity'
import { db } from './db'
import { COLOR_KEYS } from './colors'
import type { Column, Field, FieldOption, Group, Project, Repeat, Task, View, ViewFilter } from './types'

const uid = () => crypto.randomUUID()
const plain = <T>(v: T): T => $state.snapshot(v) as T
const NONE = '__none'

const isoDay = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export const today = () => isoDay(new Date())
const plusDays = (n: number) => isoDay(new Date(Date.now() + n * 86400000))

export function dueBucket(t: Task): 'overdue' | 'today' | 'week' | 'later' | 'none' {
  if (!t.due) return 'none'
  const td = today()
  if (t.due < td) return 'overdue'
  if (t.due === td) return 'today'
  if (t.due <= plusDays(7)) return 'week'
  return 'later'
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Date -> local 'yyyy-MM-ddTHH:mm' */
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

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

export interface ReminderAlert { id: string; taskId: string; title: string; at: string }

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

/** The part of a view that counts as "saved settings" (search is transient). */
const viewSig = (v: View) =>
  JSON.stringify([v.layout, v.groupBy, v.filters, v.sort, [...v.hidden].sort(), v.showCompleted])

class AppStore {
  ready = $state(false)
  projects = $state<Project[]>([])
  columns = $state<Column[]>([])
  tasks = $state<Task[]>([])
  fields = $state<Field[]>([])
  options = $state<FieldOption[]>([])
  views = $state<View[]>([])
  currentProjectId = $state('')
  currentViewId = $state('')
  draft = $state<View>(newView('', 'Default')) // working copy of the current view
  openTaskId = $state<string | null>(null)
  alerts = $state<ReminderAlert[]>([])
  settingsOpen = $state(false)
  private settings = new SvelteMap<string, unknown>()

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
  private setSetting(key: string, value: unknown) {
    this.settings.set(key, value)
    void db.settings.put({ key, value: plain(value) })
  }

  /** Generic persisted preference (appearance, Google settings...). undefined resets to the default. */
  pref<T>(key: string, fallback: T): T {
    return (this.settings.get('p:' + key) as T | undefined) ?? fallback
  }
  setPref(key: string, value: unknown) {
    if (value === undefined) {
      this.settings.delete('p:' + key)
      void db.settings.delete('p:' + key)
    } else this.setSetting('p:' + key, value)
  }

  /** Persisted UI sizes (px), e.g. sidebar and detail panel width. */
  width(key: string, fallback: number) {
    return (this.settings.get('w:' + key) as number | undefined) ?? fallback
  }
  setWidth(key: string, px: number) {
    this.setSetting('w:' + key, Math.round(px))
  }

  // ---------- load ----------
  /** (Re)read all data tables from IndexedDB into memory. */
  private async loadTables() {
    const [projects, columns, tasks, fields, options, views] = await Promise.all([
      db.projects.toArray(),
      db.columns.toArray(),
      db.tasks.toArray(),
      db.fields.toArray(),
      db.options.toArray(),
      db.views.toArray(),
    ])
    this.projects = projects.sort((a, b) => a.order - b.order)
    this.columns = columns
    this.tasks = tasks.map((t) => ({ ...t, reminders: t.reminders ?? [] }))
    this.fields = fields.sort((a, b) => a.order - b.order)
    this.options = options.map((o, i) => ({ ...o, order: o.order ?? i }))
    this.views = views
  }

  async init() {
    const settings = await db.settings.toArray()
    settings.forEach((s) => !s.key.startsWith('x:') && this.settings.set(s.key, s.value)) // x: = sync internals
    await this.loadTables()
    if (!this.projects.length) await this.seed()
    for (const p of this.projects) if (!this.views.some((v) => v.projectId === p.id)) await this.seedViews(p.id)
    const lastId = this.settings.get('currentProjectId') as string | undefined
    this.currentProjectId = this.projects.some((p) => p.id === lastId) ? lastId! : this.projects[0].id
    this.loadView()
    this.ready = true
  }

  private async seed() {
    await this.addProject('Personal')
    const fProject = await this.addField('Project')
    const fScope = await this.addField('Scope')
    await this.addOption(fProject.id, 'Other', 'brown')
    await this.addOption(fScope.id, 'other', 'lime')
  }

  // ---------- cloud sync support ----------
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
    return out
  }

  /** Write remote changes to IndexedDB (data === null deletes) and refresh the in-memory state. */
  async applySync(changes: Map<string, unknown | null>) {
    const tables = { projects: db.projects, columns: db.columns, tasks: db.tasks, fields: db.fields, options: db.options, views: db.views }
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
    for (const p of this.projects) if (!this.views.some((v) => v.projectId === p.id)) await this.seedViews(p.id)
    if (!this.projects.some((p) => p.id === this.currentProjectId)) this.currentProjectId = this.projects[0]?.id ?? ''
    if (this.currentProjectId) this.loadView()
    if (this.openTaskId && !this.tasks.some((t) => t.id === this.openTaskId)) this.openTaskId = null
  }

  /** Remove all local data (used when joining an existing cloud vault from a fresh device). */
  async wipeAll() {
    await db.transaction('rw', [db.projects, db.columns, db.tasks, db.fields, db.options, db.views], async () => {
      await Promise.all([db.projects.clear(), db.columns.clear(), db.tasks.clear(), db.fields.clear(), db.options.clear(), db.views.clear()])
    })
    await this.loadTables()
  }

  // ---------- views ----------
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

  selectView(id: string) {
    const v = this.views.find((x) => x.id === id)
    if (!v) return
    this.currentViewId = id
    this.draft = structuredClone(plain(v))
    this.setSetting('view:' + this.currentProjectId, id)
    this.setSetting('draft:' + this.currentProjectId, this.draft)
  }

  updateDraft(patch: Partial<View>) {
    Object.assign(this.draft, patch)
    this.setSetting('draft:' + this.currentProjectId, this.draft)
  }

  resetDraft() {
    if (this.currentView) this.selectView(this.currentView.id)
  }

  async saveView() {
    const v = this.currentView
    if (!v) return
    Object.assign(v, plain({ ...this.draft, id: v.id, name: v.name, order: v.order, search: '' }))
    await db.views.put(plain(v))
    this.selectView(v.id)
  }

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

  async renameView(id: string, name: string) {
    const v = this.views.find((x) => x.id === id)
    if (!v || !name.trim()) return
    v.name = name.trim()
    if (id === this.currentViewId) this.draft.name = v.name
    await db.views.put(plain(v))
  }

  async deleteView(id: string) {
    if (this.projectViews.length <= 1) return
    const wasCurrent = id === this.currentViewId
    this.views = this.views.filter((v) => v.id !== id)
    await db.views.delete(id)
    if (this.defaultViewId === id) this.setSetting('default:' + this.currentProjectId, this.projectViews[0].id)
    if (wasCurrent) this.selectView(this.defaultViewId ?? this.projectViews[0].id)
  }

  setDefaultView(id: string) {
    this.setSetting('default:' + this.currentProjectId, id)
  }

  // ---------- filters ----------
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

  filterLabel(key: string) {
    const builtin: Record<string, string> = { status: 'Status', priority: 'Priority', due: 'Due date', completed: 'Completed' }
    return builtin[key] ?? this.fields.find((f) => f.id === key)?.name ?? key
  }

  /** Every key usable for filter / group by / sort. */
  get attributeKeys() {
    return ['status', 'priority', 'due', 'completed', ...this.fields.map((f) => f.id)]
  }

  addFilter(key: string) {
    if (this.draft.filters.some((f) => f.key === key)) return
    this.updateDraft({ filters: [...this.draft.filters, { key, op: 'includes', values: [] }] })
  }

  setFilter(key: string, patch: Partial<ViewFilter>) {
    this.updateDraft({ filters: this.draft.filters.map((f) => (f.key === key ? { ...f, ...patch } : f)) })
  }

  removeFilter(key: string) {
    this.updateDraft({ filters: this.draft.filters.filter((f) => f.key !== key) })
  }

  private valuesOf(t: Task, key: string): string[] {
    switch (key) {
      case 'status': return [t.columnId]
      case 'priority': return [String(t.priority)]
      case 'due': return [dueBucket(t)]
      case 'completed': return [String(t.done)]
      default: return t.tags[key]?.length ? t.tags[key] : [NONE]
    }
  }

  matches(t: Task) {
    const v = this.draft
    if (!v.showCompleted && t.done) return false
    const s = v.search.trim().toLowerCase()
    if (s && !(t.title + ' ' + t.description).toLowerCase().includes(s)) return false
    for (const f of v.filters) {
      if (!f.values.length) continue
      const have = this.valuesOf(t, f.key)
      const hit = f.values.some((x) => have.includes(x))
      if (f.op === 'includes' ? !hit : hit) return false
    }
    return true
  }

  // ---------- groups ----------
  fieldOptions(fieldId: string) {
    return this.options.filter((o) => o.fieldId === fieldId).sort((a, b) => a.order - b.order)
  }

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

  private groupKeys(t: Task): string[] {
    const key = this.draft.groupBy
    return key === 'none' ? ['all'] : this.valuesOf(t, key)
  }

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

  groupTasks(g: Group) {
    return this.tasks.filter((t) => this.groupKeys(t).includes(g.key) && this.matches(t)).sort((a, b) => this.compare(a, b))
  }

  /** Drag & drop: place a card in a group at a position (index among visible cards). */
  async moveTask(id: string, groupKey: string, index: number) {
    const t = this.tasks.find((x) => x.id === id)
    const g = this.groups.find((x) => x.key === groupKey)
    if (!t || !g) return
    const already = this.groupKeys(t).includes(g.key)
    if (!already) {
      const patch = g.apply?.(t)
      if (!patch) return
      Object.assign(t, patch, { updatedAt: Date.now() })
    }
    if (this.draft.sort) {
      await db.tasks.put(plain(t))
      return
    }
    const members = this.tasks.filter((x) => x.id !== id && this.groupKeys(x).includes(g.key))
    const visible = members.filter((x) => this.matches(x)).sort((a, b) => a.order - b.order)
    const hidden = members.filter((x) => !this.matches(x)).sort((a, b) => a.order - b.order)
    visible.splice(index, 0, t)
    const all = [...visible, ...hidden]
    all.forEach((x, i) => (x.order = i))
    await db.tasks.bulkPut(plain(all))
  }

  // ---------- group (column / option) editing ----------
  async renameGroup(g: Group, name: string) {
    const n = name.trim()
    if (!n) return
    if (g.editable === 'status') await this.updateColumn(g.key, { name: n })
    else if (g.editable === 'option') await this.updateOption(g.key, { label: n })
  }

  async recolorGroup(g: Group, color: string) {
    if (g.editable === 'status') await this.updateColumn(g.key, { color })
    else if (g.editable === 'option') await this.updateOption(g.key, { color })
  }

  async deleteGroup(g: Group) {
    if (g.editable === 'status') await this.deleteColumn(g.key)
    else if (g.editable === 'option') await this.deleteOption(g.key)
  }

  async addGroup(name: string) {
    const n = name.trim()
    if (!n) return
    const key = this.draft.groupBy
    if (key === 'status') await this.addColumn(this.currentProjectId, n)
    else if (this.fields.some((f) => f.id === key)) await this.addOption(key, n)
  }

  get canAddGroup() {
    return this.draft.groupBy === 'status' || this.fields.some((f) => f.id === this.draft.groupBy)
  }

  async reorderGroup(key: string, newIndex: number) {
    const gb = this.draft.groupBy
    const list: { id: string; order: number }[] =
      gb === 'status' ? this.projectColumns : this.fieldOptions(gb)
    const i = list.findIndex((x) => x.id === key)
    if (i < 0) return
    const [m] = list.splice(i, 1)
    list.splice(newIndex, 0, m)
    list.forEach((x, n) => (x.order = n))
    if (gb === 'status') await db.columns.bulkPut(plain(list as Column[]))
    else await db.options.bulkPut(plain(list as FieldOption[]))
  }

  // ---------- projects ----------
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
    return p
  }

  async renameProject(id: string, name: string) {
    const p = this.projects.find((x) => x.id === id)
    if (!p || !name.trim()) return
    p.name = name.trim()
    await db.projects.put(plain(p))
  }

  async deleteProject(id: string) {
    if (this.projects.length <= 1) return
    this.projects = this.projects.filter((p) => p.id !== id)
    this.columns = this.columns.filter((c) => c.projectId !== id)
    this.tasks = this.tasks.filter((t) => t.projectId !== id)
    this.views = this.views.filter((v) => v.projectId !== id)
    await db.transaction('rw', db.projects, db.columns, db.tasks, db.views, async () => {
      await db.projects.delete(id)
      await db.columns.where('projectId').equals(id).delete()
      await db.tasks.where('projectId').equals(id).delete()
      await db.views.where('projectId').equals(id).delete()
    })
    if (this.currentProjectId === id) this.selectProject(this.projects[0].id)
  }

  selectProject(id: string) {
    this.currentProjectId = id
    this.setSetting('currentProjectId', id)
    this.loadView()
  }

  // ---------- columns ----------
  async addColumn(projectId: string, name: string, color = 'gray') {
    const order = this.columns.filter((c) => c.projectId === projectId).length
    const c: Column = { id: uid(), projectId, name, color, order }
    this.columns.push(c)
    await db.columns.put(plain(c))
    return c
  }

  async updateColumn(id: string, patch: Partial<Pick<Column, 'name' | 'color'>>) {
    const c = this.columns.find((x) => x.id === id)
    if (!c) return
    Object.assign(c, patch)
    await db.columns.put(plain(c))
  }

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
  async addField(name: string) {
    const f: Field = { id: uid(), name, order: this.fields.length }
    this.fields.push(f)
    await db.fields.put(plain(f))
    return f
  }

  async renameField(id: string, name: string) {
    const f = this.fields.find((x) => x.id === id)
    if (!f || !name.trim()) return
    f.name = name.trim()
    await db.fields.put(plain(f))
  }

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

  async addOption(fieldId: string, label: string, color?: string) {
    const n = this.options.filter((o) => o.fieldId === fieldId).length
    const o: FieldOption = {
      id: uid(), fieldId, label, order: n, color: color ?? COLOR_KEYS[(n + 1) % COLOR_KEYS.length],
    }
    this.options.push(o)
    await db.options.put(plain(o))
    return o
  }

  async updateOption(id: string, patch: Partial<Pick<FieldOption, 'label' | 'color'>>) {
    const o = this.options.find((x) => x.id === id)
    if (!o) return
    Object.assign(o, patch)
    await db.options.put(plain(o))
  }

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
  }

  private fireAlert(t: Task, at: string) {
    if (this.alerts.some((a) => a.taskId === t.id && a.at === at)) return
    this.alerts.push({ id: uid(), taskId: t.id, title: t.title, at })
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const opts = { body: 'Reminder', tag: t.id, icon: '/favicon.svg' }
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification(t.title, opts))
        .catch(() => new Notification(t.title, opts))
    }
  }

  dismissAlert(id: string) {
    this.alerts = this.alerts.filter((a) => a.id !== id)
  }

  async snooze(alert: ReminderAlert, minutes: number) {
    const t = this.tasks.find((x) => x.id === alert.taskId)
    this.dismissAlert(alert.id)
    if (!t) return
    const at = toLocalInput(new Date(Date.now() + minutes * 60000))
    await this.updateTask(t.id, { reminders: [...t.reminders, { id: uid(), at, repeat: 'none', fired: false }] })
  }

  // ---------- tasks ----------
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

  async updateTask(id: string, patch: Partial<Task>) {
    const t = this.tasks.find((x) => x.id === id)
    if (!t) return
    Object.assign(t, patch, { updatedAt: Date.now() })
    await db.tasks.put(plain(t))
  }

  async deleteTask(id: string) {
    this.tasks = this.tasks.filter((t) => t.id !== id)
    if (this.openTaskId === id) this.openTaskId = null
    await db.tasks.delete(id)
  }
}

export const store = new AppStore()
