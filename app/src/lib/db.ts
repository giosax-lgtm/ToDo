// DATABASE LOCALE (IndexedDB tramite Dexie). Definisce lo schema 'todo-slack' ed esporta l'istanza unica 'db'.
// Usato quasi solo da lib/store.svelte.ts (lettura/scrittura dei dati) e da lib/cloud.svelte.ts (chiavi di sync 'x:dek' e 'x:base' nella tabella settings).
// I tipi delle righe sono in lib/types.ts. Cambiare lo schema richiede un nuovo this.version(n) con la migrazione.

import Dexie, { type EntityTable } from 'dexie'
import type { Column, Field, FieldOption, LogEntry, MatrixItem, NotePage, NoteSection, Project, Setting, Step, Task, View } from './types'

// Sottoclasse Dexie che dichiara le tabelle tipizzate (una per entita' di lib/types.ts).
class TodoDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  columns!: EntityTable<Column, 'id'>
  tasks!: EntityTable<Task, 'id'>
  fields!: EntityTable<Field, 'id'>
  options!: EntityTable<FieldOption, 'id'>
  settings!: EntityTable<Setting, 'key'>
  views!: EntityTable<View, 'id'>
  notes!: EntityTable<NotePage, 'id'>
  noteSections!: EntityTable<NoteSection, 'id'>
  steps!: EntityTable<Step, 'id'>
  logs!: EntityTable<LogEntry, 'id'>
  matrix!: EntityTable<MatrixItem, 'id'>

  // Nome del database e schema (indici). v1: tabelle base; v2: aggiunge 'views'; v3: aggiunge 'notes' e 'noteSections' (quaderno note); v4: aggiunge 'steps' e 'logs' (tracciamento dei task); v5: aggiunge 'matrix' (matrice di Eisenhower). Solo i campi indicizzati sono elencati; gli altri sono memorizzati comunque.
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
    this.version(3).stores({ notes: 'id, projectId, sectionId', noteSections: 'id, projectId' })
    this.version(4).stores({ steps: 'id, taskId, projectId', logs: 'id, taskId, projectId' })
    // v5: 'matrix' (voci della matrice di Eisenhower). Le voci che stavano nelle preferenze 'p:eisenhower:<listId>' vengono spostate nella tabella.
    this.version(5).stores({ matrix: 'id, projectId, taskId' }).upgrade(async (tx) => {
      const rows: MatrixItem[] = []
      const keys: string[] = []
      await tx.table('settings').each((s: Setting) => {
        if (!s.key.startsWith('p:eisenhower:') || !Array.isArray(s.value)) return
        keys.push(s.key)
        const projectId = s.key.slice('p:eisenhower:'.length)
        for (const i of s.value as Omit<MatrixItem, 'projectId'>[]) rows.push({ ...i, projectId })
      })
      await tx.table('matrix').bulkPut(rows)
      await tx.table('settings').bulkDelete(keys)
    })
  }
}

// Istanza unica del database, importata da store.svelte.ts e cloud.svelte.ts.
export const db = new TodoDB()
