export interface Project {
  id: string
  name: string
  order: number
}

export interface Column {
  id: string
  projectId: string
  name: string
  color: string // key into COLORS
  order: number
}

/** A tag field such as "Project" or "Scope". Shared by all lists. */
export interface Field {
  id: string
  name: string
  order: number
}

export interface FieldOption {
  id: string
  fieldId: string
  label: string
  color: string
  order: number
}

export interface Subtask {
  id: string
  text: string
  done: boolean
}

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Reminder {
  id: string
  at: string // local date-time 'yyyy-MM-ddTHH:mm'
  repeat: Repeat
  fired: boolean // one-time reminders: already shown
}

export interface Task {
  id: string
  projectId: string
  columnId: string
  title: string
  description: string
  priority: 0 | 1 | 2 | 3 | 4 | 5
  due: string | null // yyyy-mm-dd
  done: boolean
  tags: Record<string, string[]> // fieldId -> optionIds
  subtasks: Subtask[]
  reminders: Reminder[]
  order: number
  createdAt: number
  updatedAt: number
}

export type Layout = 'board' | 'table'

/** key: 'status' | 'priority' | 'due' | 'completed' | <fieldId> */
export interface ViewFilter {
  key: string
  op: 'includes' | 'excludes'
  values: string[]
}

export interface ViewSort {
  key: string // 'name' | 'status' | 'priority' | 'due' | 'created' | <fieldId>
  dir: 'asc' | 'desc'
}

export interface View {
  id: string
  projectId: string
  name: string
  layout: Layout
  groupBy: string // 'status' | 'priority' | 'due' | 'completed' | <fieldId>
  filters: ViewFilter[]
  sort: ViewSort | null
  hidden: string[] // 'priority' | 'due' | 'subtasks' | 'description' | <fieldId>
  showCompleted: boolean
  search: string // transient, never saved in a view
  order: number
}

/** A swim-lane / board column in the current grouping. */
export interface Group {
  key: string
  label: string
  color: string
  editable: 'status' | 'option' | null
  fixed?: boolean // not reorderable
  apply: ((t: Task) => Partial<Task>) | null // what changes when a card is dropped here; null = not droppable
}

export interface Setting {
  key: string
  value: unknown
}
