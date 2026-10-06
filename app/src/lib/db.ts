// DATABASE LOCALE (IndexedDB tramite Dexie). Definisce lo schema 'todo-slack' ed esporta l'istanza unica 'db'.
// Usato quasi solo da lib/store.svelte.ts (lettura/scrittura dei dati) e da lib/cloud.svelte.ts (chiavi di sync 'x:dek' e 'x:base' nella tabella settings).
// I tipi delle righe sono in lib/types.ts. Cambiare lo schema richiede un nuovo this.version(n) con la migrazione.

import Dexie, { type EntityTable } from 'dexie'
import type { Column, Field, FieldOption, Project, Setting, Task, View } from './types'

// Sottoclasse Dexie che dichiara le tabelle tipizzate (una per entita' di lib/types.ts).
class TodoDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  columns!: EntityTable<Column, 'id'>
  tasks!: EntityTable<Task, 'id'>
  fields!: EntityTable<Field, 'id'>
  options!: EntityTable<FieldOption, 'id'>
  settings!: EntityTable<Setting, 'key'>
  views!: EntityTable<View, 'id'>

  // Nome del database e schema (indici). v1: tabelle base; v2: aggiunge 'views'. Solo i campi indicizzati sono elencati; gli altri sono memorizzati comunque.
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

// Istanza unica del database, importata da store.svelte.ts e cloud.svelte.ts.
export const db = new TodoDB()
