import Dexie, { type EntityTable } from 'dexie'
import type { Column, Field, FieldOption, Project, Setting, Task, View } from './types'

class TodoDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  columns!: EntityTable<Column, 'id'>
  tasks!: EntityTable<Task, 'id'>
  fields!: EntityTable<Field, 'id'>
  options!: EntityTable<FieldOption, 'id'>
  settings!: EntityTable<Setting, 'key'>
  views!: EntityTable<View, 'id'>

  constructor() {
    super('todo-slack')
    this.version(1).stores({
      projects: 'id',
      columns: 'id, projectId',
      tasks: 'id, projectId, columnId',
      fields: 'id',
      options: 'id, fieldId',
      settings: 'key',
    })
    this.version(2).stores({ views: 'id, projectId' })
  }
}

export const db = new TodoDB()
