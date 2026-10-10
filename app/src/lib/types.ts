// TIPI DEL MODELLO DATI condivisi da tutta l'app (solo interfacce TypeScript, nessun codice eseguibile).
// Le entita' persistite in IndexedDB (Project, Column, Task, Field, FieldOption, View, Setting) sono dichiarate nello schema di lib/db.ts
// e gestite da lib/store.svelte.ts; le stesse entita' (esclusa Setting) vengono sincronizzate/cifrate da lib/cloud.svelte.ts e lib/backup.ts.
// I tipi Group e ViewFilter/ViewSort descrivono invece la logica di visualizzazione (raggruppamento, filtri, ordinamento) usata da
// Toolbar, Board, Column e TableView.

// Una LISTA (progetto/board) mostrata nella Sidebar. Ogni lista ha le proprie colonne di stato, i propri task e le proprie viste.
export interface Project {
  id: string
  name: string
  order: number
}

// Una COLONNA DI STATO di una lista (es. 'Not started', 'In progress'). Il task punta alla colonna con Task.columnId. 'color' e' una chiave di lib/colors.ts.
export interface Column {
  id: string
  projectId: string
  name: string
  color: string // key into COLORS
  order: number
}

// Un CAMPO TAG personalizzato (es. 'Project', 'Scope'). E' condiviso da tutte le liste; le sue scelte sono le FieldOption.
/** A tag field such as "Project" or "Scope". Shared by all lists. */
export interface Field {
  id: string
  name: string
  order: number
}

// Un singolo TAG selezionabile di un Field (etichetta + colore). Il task lo referenzia in Task.tags[fieldId].
export interface FieldOption {
  id: string
  fieldId: string
  label: string
  color: string
  order: number
}

// Un sotto-task (checklist) contenuto dentro un Task; modificato da CardDetail.svelte.
export interface Subtask {
  id: string
  text: string
  done: boolean
}

// Frequenza di ripetizione di un reminder. Calcolo della prossima occorrenza: nextOccurrence() in store.svelte.ts; mappatura su Google Calendar: RRULE in gcal.svelte.ts.
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

// Un PROMEMORIA di un task: data/ora locale, ripetizione e flag 'fired' (gia' mostrato). Gestito da Reminders.svelte, attivato da store.checkReminders(), inviato a Calendar da gcal.svelte.ts.
export interface Reminder {
  id: string
  at: string // local date-time 'yyyy-MM-ddTHH:mm'
  repeat: Repeat
  fired: boolean // one-time reminders: already shown
}

// Un ELEMENTO/TASK: l'entita' principale. Appartiene a una lista (projectId) e a una colonna (columnId); 'order' e' l'ordine manuale tra le card;
// 'tags' mappa fieldId -> id delle opzioni scelte. Mostrato da Card.svelte / TableView.svelte e modificato da CardDetail.svelte.
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

// Modo di visualizzazione di una vista: 'board' (colonne kanban, Board.svelte) o 'table' (TableView.svelte).
export type Layout = 'board' | 'table'

// Una VISTA salvata di una lista: layout, raggruppamento, filtri, ordinamento, campi nascosti. 'store.draft' e' la copia di lavoro modificabile;
// 'search' e' transitorio e non viene mai salvato nella vista.
// Un filtro di una vista (chiave attributo + 'includes'/'excludes' + valori). Creato dalla Toolbar, valutato da store.matches().
/** key: 'status' | 'priority' | 'due' | 'completed' | <fieldId> */
export interface ViewFilter {
  key: string
  op: 'includes' | 'excludes'
  values: string[]
}

// Ordinamento di una vista (chiave + direzione). Se assente vale l'ordine manuale (Task.order). Applicato da store.compare().
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

// Un GRUPPO di visualizzazione (colonna del board o gruppo della tabella) nel raggruppamento corrente. Costruito da store.computeGroups();
// 'apply' dice cosa cambia in un task quando viene trascinato in quel gruppo (null = non e' possibile rilasciarvi card).
/** A swim-lane / board column in the current grouping. */
export interface Group {
  key: string
  label: string
  color: string
  editable: 'status' | 'option' | null
  fixed?: boolean // not reorderable
  apply: ((t: Task) => Partial<Task>) | null // what changes when a card is dropped here; null = not droppable
}

// Una SEZIONE del quaderno note di una lista (come le schede di OneNote). Contiene piu' pagine (NotePage.sectionId). Gestita da store.svelte.ts, mostrata da Notes.svelte.
export interface NoteSection {
  id: string
  projectId: string
  name: string
  order: number
}

// Una CASELLA DI TESTO libera dentro una pagina (come in OneNote): posizione e larghezza in pixel sulla "tela" della pagina, e il suo contenuto HTML (sanificato).
export interface NoteBox {
  id: string
  x: number
  y: number
  w: number
  html: string
}

// Una PAGINA di note dentro una sezione. Il contenuto e' un insieme di caselle libere ('boxes'); 'html' e' il vecchio formato a testo unico, ancora letto
// (diventa una casella al primo salvataggio). Ogni HTML e' SEMPRE passato da sanitizeHtml() (lib/notehtml.ts) prima di essere salvato o mostrato.
export interface NotePage {
  id: string
  projectId: string
  sectionId: string
  title: string
  html: string
  boxes?: NoteBox[]
  order: number
  createdAt: number
  updatedAt: number
}

// Posizione/dimensione/stato della finestra note (preferenza 'notesWin'): aperta, ridotta a barra del titolo, ingrandita.
export interface NotesWin {
  open: boolean
  min: boolean
  max: boolean
  x: number
  y: number
  w: number
  h: number
  list: boolean // elenco pagine visibile
  docked?: boolean // agganciata al bordo destro (pannello a tutta altezza) invece che flottante
}

// Riga della tabella 'settings' (chiave/valore) di IndexedDB: preferenze, vista corrente, larghezze pannelli, stato di sync. Accesso tramite store.pref()/setPref().
export interface Setting {
  key: string
  value: unknown
}
