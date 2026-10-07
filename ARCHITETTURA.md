# toDo: guida per il programmatore

Questo documento spiega com'è fatto il programma e come intervenire sul codice. Per l'uso dell'app vedi [GUIDA_UTENTE.md](GUIDA_UTENTE.md); per installazione e pubblicazione vedi [SETUP.md](SETUP.md).

Ogni file di codice inizia con un commento che ne descrive il ruolo e i legami con gli altri file, e ogni funzione ha un commento che spiega cosa fa e da chi viene usata. Questa guida è la mappa d'insieme.

---

## 1. Panoramica

toDo è una **PWA** (Progressive Web App) kanban, privata e senza server:

- **Stack**: Svelte 5 (runes: `$state`, `$derived`, `$effect`), TypeScript, Vite, Dexie (IndexedDB), SortableJS, vite-plugin-pwa.
- **Dati**: restano nel browser (IndexedDB). Nessun backend.
- **Funzioni opzionali verso Google** (tutte disattivate di default): sync cifrata su Google Drive (cartella nascosta dell'app) e reminder su Google Calendar. Il Client ID OAuth lo inserisce l'utente nelle impostazioni, nessuna credenziale è nel repository.
- **Offline**: il service worker (generato da `vite.config.ts`) mette in cache l'app.

Comandi (da `app/`):

| Comando | Cosa fa |
|---|---|
| `npm install` | installa le dipendenze |
| `npm run dev` | server di sviluppo con hot reload |
| `npm test` | test unitari (Vitest) |
| `npm run check` | controllo tipi (svelte-check + tsc) |
| `npm run serve` | build + anteprima su http://localhost:4173 (usato da `avvia-todo.bat`) |

> Nota: `npm run check` segnala oggi 2 errori in `App.svelte` (confronto tra tipi del tema), preesistenti e non bloccanti per la build.

## 2. Struttura delle cartelle

```
/
├─ README.md, SETUP.md            documentazione generale e installazione
├─ ARCHITETTURA.md, GUIDA_UTENTE.md   queste guide
├─ avvia-todo.bat                 avvio rapido su Windows
├─ .github/workflows/deploy.yml   deploy automatico su GitHub Pages
└─ app/
   ├─ index.html                  pagina unica + Content-Security-Policy
   ├─ vite.config.ts              build + configurazione PWA
   ├─ package.json, tsconfig*.json, svelte.config.js
   ├─ public/                     icone PWA
   └─ src/
      ├─ main.ts                  punto d'ingresso: monta App.svelte
      ├─ App.svelte               componente radice, timer, tema
      ├─ app.css                  TUTTI gli stili
      └─ lib/                     tutto il resto (vedi sotto)
```

### Contenuto di `src/lib/`

| Gruppo | File | Ruolo |
|---|---|---|
| **Dati** | `types.ts` | interfacce del modello dati |
| | `db.ts` | schema IndexedDB (Dexie), istanza `db` |
| | `store.svelte.ts` | **store centrale**: stato, logica, persistenza |
| | `colors.ts` | palette colori di colonne e tag |
| **Sync e backup** | `google.ts` | login OAuth Google, gestione token |
| | `drive.ts` | client minimale Drive (appDataFolder) |
| | `crypto.ts` | cifratura (PBKDF2, AES-GCM, gzip, hash) |
| | `merge.ts` (+ `merge.test.ts`) | merge puro tra dispositivi, testato |
| | `cloud.svelte.ts` | servizio di sync cifrata (`cloud`) |
| | `gcal.svelte.ts` | reminder su Google Calendar (`gcal`) |
| | `backup.ts` | export/import file di backup cifrato |
| **Note** | `Notes.svelte` | finestra note flottante: sezioni, pagine, editor |
| | `notehtml.ts` | sanificazione (lista bianca) dell'HTML delle note |
| | `noteexport.ts`, `zip.ts` | esportazione docx/pdf/html/md/txt; mini writer zip |
| **Interazione** | `sortable.ts` | azione drag & drop |
| | `resizer.ts` | azione ridimensionamento pannelli |
| **UI** | `Sidebar`, `Toolbar`, `Board`, `Column`, `Card`, `TableView`, `CardDetail`, `TagPicker`, `Reminders`, `Alerts`, `Settings`, `Pill`, `Linkify` (`.svelte`) | componenti |

## 3. Architettura

### 3.1 Flusso generale

```
index.html → main.ts → App.svelte
                         ├─ Sidebar ──────── liste + indicatore sync
                         ├─ Toolbar ──────── viste, filtri, ricerca
                         ├─ Board → Column → Card     (layout "board")
                         ├─ TableView                 (layout "table")
                         ├─ CardDetail → Reminders, TagPicker
                         ├─ Settings ─────── aspetto, Calendar, backup, sync
                         └─ Alerts ───────── banner reminder scaduti

        tutti i componenti  ⇄  store (store.svelte.ts)  ⇄  IndexedDB (db.ts)
                                   ▲
              cloud.svelte.ts ─────┤  syncEntities() / applySync()
              gcal.svelte.ts ──────┤  legge i task
              backup.ts ───────────┘  syncEntities() / applySync() / wipeAll()
```

Regola fondamentale: **i componenti non toccano mai IndexedDB**. Leggono lo stato reattivo dello store e chiamano i suoi metodi; lo store aggiorna prima la memoria e poi IndexedDB.

### 3.2 Lo store (`store.svelte.ts`)

È una classe `AppStore` con un'unica istanza esportata (`store`). Contiene:

- **Dati in memoria** (`projects`, `columns`, `tasks`, `fields`, `options`, `views`): specchio delle tabelle IndexedDB.
- **Stato UI**: `currentProjectId`, `currentViewId`, `draft`, `openTaskId`, `alerts`, `settingsOpen`.
- **Preferenze persistite** (tabella `settings`): `pref()/setPref()` per le preferenze generiche, `width()/setWidth()` per le larghezze dei pannelli. Le chiavi hanno prefisso: `p:` preferenze, `w:` larghezze, `x:` dati interni di sync (non caricati nello store), altre chiavi per vista corrente/bozza/vista predefinita.
- **Valori derivati** (`$derived`): `projectColumns`, `projectViews`, `currentView`, `dirty`, `openTask`, `groups`.
- **Logica di visualizzazione**: `matches` (filtri e ricerca), `computeGroups` (raggruppamento), `compare` (ordinamento), `groupTasks`.
- **Azioni CRUD**: progetti, colonne, campi, opzioni, task, viste.
- **Reminder**: `checkReminders`, `fireAlert`, `snooze`.
- **Supporto sync**: `syncEntities`, `applySync`, `wipeAll`.

Convenzione per ogni modifica: (1) cambia l'oggetto in memoria, (2) scrive su IndexedDB passando da `plain()` (snapshot, perché i proxy `$state` non sono clonabili da IndexedDB).

### 3.3 Viste, bozza e gruppi

- Una **vista** (`View`) salva layout, raggruppamento (`groupBy`), filtri, ordinamento e campi nascosti.
- `store.draft` è la **copia di lavoro**: la Toolbar la modifica con `updateDraft` e l'app la mostra subito; la vista salvata cambia solo con `saveView`. `dirty` confronta le due tramite `viewSig`.
- La **ricerca** è nella bozza ma non viene mai salvata.
- I **gruppi** (`Group`, calcolati da `computeGroups`) sono le colonne del board / blocchi della tabella. Ogni gruppo ha `apply`, la funzione che descrive cosa cambia in un task trascinato lì (es. nuova colonna di stato, nuova priorità, nuovo tag). `apply = null` significa "non si può rilasciare qui" (es. gruppi di scadenza "Overdue", "Next 7 days", "Later").
- Il raggruppamento può essere per: stato (colonne), priorità, completato, scadenza, o qualsiasi campo tag.

### 3.4 Drag & drop

`sortable.ts` avvolge SortableJS ma **ripristina il DOM** al rilascio e chiama `onMove`; poi `store.moveTask` / `store.reorderGroup` cambiano lo stato e Svelte ridisegna. Così Svelte resta l'unico proprietario del DOM. Per questo motivo ogni contenitore trascinabile ha un `data-col` (chiave del gruppo) e ogni elemento un `data-id`; un contenitore con `data-drop="0"` rifiuta i rilasci.

Se la vista ha un ordinamento attivo, il riordino manuale è disabilitato (`sort: !store.draft.sort`) ma restano possibili gli spostamenti tra gruppi.

### 3.5 Reminder

1. L'utente aggiunge reminder al task (`Reminders.svelte`, salvati in `Task.reminders`).
2. `App.svelte` chiama `store.checkReminders()` ogni 20 secondi, all'avvio e quando la scheda torna visibile: i reminder scaduti diventano alert (`Alerts.svelte`) e notifica di sistema; quelli singoli vengono marcati `fired`, quelli ricorrenti avanzano (`nextOccurrence`).
3. Se Google Calendar è collegato, `gcal.sync()` (lanciata da un `$effect` di `App.svelte` 4 secondi dopo ogni modifica) crea/aggiorna/elimina un evento per reminder nel calendario "To-Do Reminders". L'`eventId` deriva dall'id del reminder, quindi gli aggiornamenti sono idempotenti; `gEvents` (preferenza) tiene la firma dell'ultimo evento inviato.
4. Per evitare calendari duplicati: `gcal.sync()` non gira mai in parallelo; `ensureCalendar` riusa un calendario esistente; l'id del calendario è condiviso tra dispositivi dentro i file di sync (`extras.gCalId`).

### 3.6 Sync cifrata (`cloud.svelte.ts`, `merge.ts`, `crypto.ts`, `drive.ts`)

**Cifratura.** Una chiave dati casuale (DEK, AES-256-GCM) cifra tutto. Su Drive la DEK sta solo "incartata" in `keyfile.json`: una volta con una chiave derivata dalla passphrase (PBKDF2-SHA256, 600.000 iterazioni) e una volta con una chiave di recupero casuale. Passphrase, chiave di recupero e DEK in chiaro non lasciano mai il dispositivo. In locale la DEK è una `CryptoKey` **non estraibile**, salvata in IndexedDB (`x:dek`).

**File su Drive** (cartella `appDataFolder`, visibile solo all'app):
- `keyfile.json`: vault (parametri KDF, salt, DEK incartata due volte);
- `dev-<id>.enc`: un file per dispositivo, con tutti i suoi record cifrati (gzip + AES-GCM; il nome del file è dato autenticato, quindi un file non può essere scambiato con un altro).

**Algoritmo** (`cloud.run()`):
1. `detectLocal`: confronta l'hash di ogni record con la `base` (ultima versione nota, in IndexedDB `x:base`); i record nuovi/modificati ricevono tempo `t` e autore; quelli spariti diventano **lapidi** (cancellazioni).
2. Scarica e decifra i file degli altri dispositivi; `mergeRemote` tiene, per ogni record, la versione con `(t, by)` più alto (*last writer wins*, a parità vince l'id dispositivo maggiore).
3. Le versioni vincenti remote vengono scritte in locale con `store.applySync`.
4. Se qualcosa è cambiato, il proprio file viene ricaricato. Le lapidi più vecchie di 90 giorni vengono eliminate.

**Concorrenza e trigger.** `sync()` non esegue mai due run insieme (rilancia al termine se serve). `autoSync(trigger)` applica la frequenza scelta (`SYNC_FREQ`): subito dopo le modifiche e ogni minuto, a intervalli, oppure solo manuale. I trigger sono in `App.svelte`: `$effect` dopo le modifiche, timer da 60 s, evento di visibilità, avvio.

**Token Google** (`google.ts`): il token di accesso dura 1 ora ed è copiato in `localStorage` finché non scade. Le chiamate in background non aprono mai popup; il popup parte solo da un gesto dell'utente (pulsanti in Settings oppure il primo click dopo la scadenza, gestito in `App.svelte`).

**Perché `merge.ts` è separato.** È logica pura, senza DOM né rete, così si testa facilmente (`merge.test.ts`). Se modifichi la strategia di merge, aggiorna prima i test.

### 3.7 Backup su file (`backup.ts`)

Esporta `store.syncEntities()` cifrato con una passphrase scelta al momento (PBKDF2 + AES-GCM). L'import decifra, **cancella tutto** (`wipeAll`) e applica i dati (`applySync`). È indipendente dalla sync su Drive.

### 3.8b Quaderno note (`Notes.svelte`, `notehtml.ts`, `noteexport.ts`)

Ogni lista ha un quaderno stile OneNote: **sezioni** (`noteSections`) che contengono **pagine** (`notes`, con `html`). Sono tabelle IndexedDB (schema v3) e record sincronizzati/inclusi nei backup come gli altri (`syncEntities`/`applySync`/`wipeAll`/`deleteProject` nello store).

- **Finestra**: `Notes.svelte` è flottante e non modale; geometria e stato (aperta/ridotta/ingrandita) stanno nella preferenza `notesWin` (`store.notesWin` / `setNotesWin`).
- **Tela e caselle**: una pagina contiene `boxes` (`NoteBox`: id, x, y, w, html) posizionate in modo assoluto; il vecchio campo `html` è letto come prima casella. Ogni casella è un `contenteditable` non controllato da Svelte (contenuto scritto da `boxInit`); `flush()` rilegge il DOM, scarta le caselle vuote (tranne l'attiva) e salva `boxes`. Per l'esportazione `pageHtml()` mette le caselle in ordine di lettura.
- **Aggancio a destra**: `NotesWin.docked`; la finestra diventa un figlio flex di `.layout` (larghezza in `w:notesDock`, maniglia `resizer`).
- **Editor**: `document.execCommand` sulla casella attiva. Salva con debounce di 0,5 s; una versione diversa arrivata dalla sync viene caricata solo se l'editor non ha il focus.
- **Sicurezza**: ogni HTML passa da `sanitizeHtml()` (lista bianca di tag/stili, link solo http/https/mailto, solo immagini `data:` png/jpeg/gif/webp) quando si incolla e quando si salva.
- **Esportazione**: `noteexport.ts` cammina sul DOM e produce Markdown, testo, HTML; il `.docx` è costruito a mano (XML + `zip.ts`); il PDF usa la stampa del browser in un iframe.
- **Immagini**: incollate/trascinate/importate, ridotte a max 1600 px con canvas (`createImageBitmap`, niente `blob:` per via della CSP) e salvate come data URI nella casella; nel `.docx` diventano file in `word/media` (webp escluso).
- **Ridimensionamento immagini e disegno**: cliccando un `<img>` si seleziona (`selImg`/`selRect`) e una maniglia cambia gli attributi `width`/`height` mantenendo le proporzioni. Il disegno è un `<canvas>` 1000x600 in un riquadro sopra la finestra; `padInsert()` ritaglia l'area tracciata e la inserisce come PNG (`placeImage`), quindi segue tutta la pipeline delle immagini (sync, esportazioni).
- Limiti noti: conflitti = l'ultimo che scrive vince (per l'intera pagina).

### 3.8 Stile e temi (`app.css`)

- Un solo foglio di stile globale.
- Le dimensioni sono in `rem`; `App.svelte` imposta il `font-size` di `<html>` (interfaccia), `--ts` (testo), `--col-w` (larghezza colonne) e `--font` leggendo le preferenze.
- I temi sono definiti dal selettore `[data-theme=...]` su `<html>` (`light`, `dark`, `claude`); `App.svelte` calcola il tema effettivo (anche da "Match system").
- I colori di colonne e tag vengono da `colors.ts` come stili inline.

### 3.9 PWA e sicurezza

- `vite.config.ts`: manifest e service worker (`autoUpdate`); `base: './'` per funzionare anche in sottocartelle.
- `index.html`: **Content-Security-Policy** restrittiva (`default-src 'self'`; consentiti solo gli script/endpoint Google necessari). Se aggiungi servizi esterni (altre API, font, CDN) devi autorizzarli qui, altrimenti il browser li blocca.
- Scope Google minimi: `calendar.app.created` (solo calendari/eventi creati dall'app) e `drive.appdata` (solo cartella nascosta dell'app).
- Nel calendario Google i titoli dei task sono generici a meno che l'utente attivi "Show task titles".

## 4. Come mettere le mani sul codice

### Aggiungere un campo a `Task` (es. "assegnatario")
1. `types.ts`: aggiungi il campo a `Task`.
2. `store.svelte.ts`: valorizzalo in `addTask`; in `loadTables` aggiungi un default per i dati vecchi (`...t, nuovoCampo: t.nuovoCampo ?? ...`), come già fatto per `reminders`.
3. UI: mostralo/modificalo in `CardDetail.svelte` (usando `store.updateTask`) e, se serve, in `Card.svelte` / `TableView.svelte`.
4. Se il campo deve poter essere nascosto, aggiungilo a `hideable` in `Toolbar.svelte`.
5. Per filtri/raggruppamento/ordinamento: `valuesOf`, `filterOptions`, `computeGroups`, `compare` in `store.svelte.ts` e `attributeKeys`.
6. **Sync e backup funzionano da soli**: `syncEntities` serializza l'intero record.

### Aggiungere una tabella (nuova entità sincronizzata)
1. `types.ts`: nuova interfaccia.
2. `db.ts`: aggiungi una nuova `this.version(n)` con la tabella (non modificare le versioni vecchie).
3. `store.svelte.ts`: stato + caricamento in `loadTables`; aggiungila a `syncEntities`, a `applySync` (mappa `tables`), a `wipeAll` e a `deleteProject` se dipende da un progetto.

### Aggiungere una preferenza
- Leggi con `store.pref('chiave', default)` e scrivi con `store.setPref('chiave', valore)` (nessuno schema da toccare). Se è un'impostazione grafica, aggiungi il controllo in `Settings.svelte` e, se influenza il CSS, applicala in `App.svelte`.
- Se deve essere ripristinata da "Reset appearance", aggiungi la chiave a `resetLook` in `Settings.svelte`.

### Aggiungere un tipo di raggruppamento / filtro
- `store.svelte.ts`: `valuesOf` (valori del task), `filterOptions` (scelte), `filterLabel`, `attributeKeys`, `computeGroups` (gruppi con `apply`).

### Aggiungere un colore
- `colors.ts`: nuova voce in `COLORS` (le chiavi esistenti già salvate nei dati non vanno rinominate).

### Cambiare la frequenza di sync disponibile
- `SYNC_FREQ` in `cloud.svelte.ts`; il menu di `Settings.svelte` si aggiorna da solo.

### Modificare il formato dei file cifrati
- `crypto.ts` (`encryptJson` scrive un byte di versione, ora `1`). Se cambi formato, incrementa la versione e gestisci la lettura dei file vecchi in `decryptJson`; i dispositivi con versioni diverse dell'app si leggono a vicenda, quindi mantieni la compatibilità.

### Debug e verifica
- Dati locali: DevTools → Application → IndexedDB → `todo-slack`.
- Token Google: `localStorage` chiave `todo.gtoken`.
- Stato sync: `cloud.status` / `cloud.message`, `gcal.status` / `gcal.message` (mostrati in Settings e Sidebar).
- Dopo ogni modifica al codice dell'app installata: ricostruire (`avvia-todo.bat`) e ricaricare con Ctrl+Shift+R; il service worker può servire una versione in cache.

## 5. Convenzioni e trappole da conoscere

- **Svelte 5 runes**: gli oggetti in `$state` sono proxy. Prima di salvarli o di mandarli a Dexie/sync usa `plain()`.
- **File `.svelte.ts`**: i moduli con stato reattivo (`store`, `cloud`, `gcal`) devono avere l'estensione `.svelte.ts` per poter usare `$state`/`$derived`.
- **Date**: i reminder usano la stringa locale `yyyy-MM-ddTHH:mm` (nessun fuso); le scadenze `yyyy-mm-dd`. Usa `toLocalInput` / `today()` e **non** `toISOString()` direttamente (userebbe l'UTC e sbaglierebbe giorno di notte).
- **Id**: sempre UUID (`crypto.randomUUID()`), mai contatori: servono per la sync tra dispositivi.
- **Ordine**: `order` è un indice intero ricalcolato a ogni spostamento; non assumere che sia senza buchi o duplicati (vedi `reorderGroup` e `loadTables`).
- **Cancellazioni**: eliminare un record locale produce una lapide al sync successivo; non riusare mai un id.
- **Concorrenza**: sia `cloud.sync` sia `gcal.sync` sono serializzate di proposito (un bug storico creava calendari duplicati con run paralleli). Non aggiungere chiamate che le aggirino.
- **Test**: la logica da testare deve stare in moduli puri (come `merge.ts`).
- **Commenti**: mantieni la convenzione: intestazione per file + commento prima di ogni funzione con "cosa fa" e "da chi viene usata".
