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

// Un CAMPO TAG personalizzato (es. 'Project', 'Scope'). Appartiene a una sola lista (projectId); le sue scelte sono le FieldOption.
/** A tag field such as "Project" or "Scope". Belongs to one list (projectId); legacy global fields have none until migrated. */
export interface Field {
  id: string
  projectId?: string
  kind?: 'people' // campo "Assignee": le scelte sono le persone della lista (creato in automatico, non eliminabile)
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

// Un COMMENTO di un sotto-task o di un passo (testo libero con data e ora). Mostrato/scritto da Comments.svelte; passa invariato da Subtask a Step e viceversa.
export interface StepComment {
  id: string
  at: number
  text: string
}

// Un sotto-task (checklist) contenuto dentro un Task; modificato da CardDetail.svelte.
export interface Subtask {
  id: string
  text: string
  done: boolean
  comments?: StepComment[]
}

// Stato di un PASSO del tracciamento: da fare, in corso, in attesa (di una risposta/di qualcuno), fatto.
export type StepStatus = 'todo' | 'doing' | 'waiting' | 'done'

// Un PASSO di un task con tracciamento (Task.track): e' un sotto-task con stato, scadenza facoltativa, promemoria facoltativo e "aspetto chi".
// Record separato (tabella 'steps'), cosi' la sync unisce le modifiche passo per passo. I passi nascono dal passaggio automatico dei vecchi Subtask (stesso id).
export interface Step {
  id: string
  taskId: string
  projectId: string
  text: string
  status: StepStatus
  waitingFor: string // solo con status 'waiting'
  due: string | null // yyyy-mm-dd, facoltativa
  comments?: StepComment[]
  reminder?: Reminder | null // un solo promemoria per passo (stesso tipo dei reminder del task); non scatta se il passo e' 'done'
  statusAt: number // quando e' stato impostato lo stato corrente (per "in attesa da 3 giorni")
  order: number
  createdAt: number
  updatedAt: number
}

// Una voce del DIARIO di un task con tracciamento (tabella 'logs'): 'auto' = generata dall'app, 'note' = commento scritto dall'utente. Solo in aggiunta (append-only).
export interface LogEntry {
  id: string
  taskId: string
  projectId: string
  at: number
  kind: 'auto' | 'note'
  text: string
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
  start?: string | null // yyyy-mm-dd, facoltativa: inizio per la vista Gantt (se manca vale la data di creazione)
  milestone?: boolean // traguardo: durata zero, nel Gantt e' un rombo sulla scadenza
  deps?: string[] // id dei task che devono finire prima (fine -> inizio); spostando un predecessore, questo task slitta di conseguenza
  est?: number | null // durata stimata in giorni, confrontata con la durata pianificata (inizio -> scadenza) e con quella reale
  doneAt?: string | null // yyyy-mm-dd in cui il task e' stato completato (serve alla durata reale)
  baseline?: { start: string; due: string } | null // date pianificate "congelate" con Set baseline, per vedere gli slittamenti
  due: string | null // yyyy-mm-dd
  done: boolean
  tags: Record<string, string[]> // fieldId -> optionIds
  subtasks: Subtask[]
  track?: boolean // tracciamento attivo: i sotto-task diventano Step e il task ha un diario (LogEntry)
  reminders: Reminder[]
  order: number
  createdAt: number
  updatedAt: number
}

// Modo di visualizzazione di una vista: 'board' (colonne kanban, Board.svelte), 'table' (TableView.svelte), 'gantt' (GanttView.svelte) o 'dashboard' (Dashboard.svelte).
export type Layout = 'board' | 'table' | 'gantt' | 'dashboard'

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
// Una voce della MATRICE DI EISENHOWER: idea libera (text) oppure collegata a un task (taskId). q = quadrante 1..4. Sincronizzata come gli altri record.
export interface MatrixItem {
  id: string
  projectId: string
  text: string
  q: 1 | 2 | 3 | 4
  taskId?: string
}

// Un nodo di un'analisi delle cause radice (RCA). parentId null = radice (problema / effetto). cause = marcato come causa radice; taskId = task di azione correttiva creato da questo nodo.
export interface RcaNode {
  id: string
  parentId: string | null
  text: string
  color?: string // chiave di colors.ts
  cause?: boolean
  out?: boolean // ramo scartato (ipotesi smentita): il nodo e tutto cio' che sta sotto vengono mostrati come strada interrotta
  gate?: 'and' | 'or' // solo fault tree: porta che unisce i figli (default 'or')
  taskId?: string
}

// Una riga del PARETO: causa e quante volte si e' verificata.
export interface RcaItem {
  id: string
  text: string
  n: number
}

// Un'ANALISI RCA ('whys' = 5 Perche', 'fishbone' = Ishikawa, 'faulttree' = albero dei guasti, 'isnot' = tabella E'/Non E', 'pareto' = grafico di Pareto). I nodi stanno tutti nello stesso record, che si sincronizza e si salva nei backup come gli altri. taskId = task che l'analisi indaga.
export interface Rca {
  id: string
  projectId: string
  kind: 'whys' | 'fishbone' | 'faulttree' | 'isnot' | 'pareto'
  title: string
  taskId?: string
  nodes: RcaNode[] // diagrammi ad albero; vuoto per 'isnot' e 'pareto'
  grid?: Record<string, string> // 'isnot': testo delle celle, chiave "<riga>.<colonna>" (colonne is / not / diff)
  items?: RcaItem[] // 'pareto': cause con conteggio
  updated: number
}

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
