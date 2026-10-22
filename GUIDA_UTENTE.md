# toDo: guida utente

toDo è la tua lista di cose da fare in stile **kanban** (colonne con card), privata e senza server. Si usa dal browser o si installa come app su PC e Android. I tuoi dati restano sul tuo dispositivo; se vuoi, una copia **cifrata** può essere sincronizzata tra più dispositivi tramite Google Drive.

Per installare l'app, collegare Google e pubblicarla online vedi [SETUP.md](SETUP.md). I nomi dei pulsanti nell'app sono in inglese e qui sono riportati così come li vedi.

---

## 1. Primi passi: la schermata

- **Barra laterale (sinistra)**: le tue **liste** (es. "Personal"), il pulsante **+** per crearne di nuove, l'indicatore di sincronizzazione e **⚙ Settings**. Sul telefono si apre con **☰**. Puoi allargarla o stringerla trascinandone il bordo.
- **Barra degli strumenti**: scelta della **vista**, **ricerca**, **Edit view**, **Group by**, filtri.
- **Area centrale**: le tue colonne con le card (vista *Board*) oppure una tabella (vista *Table*).
- **Pannello di dettaglio**: si apre a destra quando clicchi un elemento. Anche questo si può allargare trascinandone il bordo.

Al primo avvio trovi già una lista **Personal** con cinque colonne di stato (*Not started, In progress, Blocked, To follow-up, Questions*) e alcune viste pronte.

## 2. Liste

Una **lista** è un contenitore di elementi con le proprie colonne di stato e le proprie viste (per esempio "Lavoro", "Casa", "Spesa").

- **Crea**: **+** accanto a "Lists", scrivi il nome e premi Invio.
- **Cambia lista**: clicca il nome nella barra laterale.
- **Rinomina / elimina**: sulla lista selezionata compaiono **✎** e **🗑**. L'eliminazione cancella anche tutti gli elementi della lista e chiede conferma. Deve restare almeno una lista.

## 3. Elementi (task)

### Creare un elemento
- Nella colonna premi **+ Add item**, scrivi il titolo e:
  - **Invio**: crea l'elemento e apre il dettaglio per completarlo;
  - **Ctrl+Invio**: lo crea e resta nel campo per aggiungerne altri di seguito;
  - **Esc**: annulla.
- L'elemento nasce già nel gruppo in cui lo crei: colonna di stato, priorità, tag o scadenza dipendono dal raggruppamento in uso (vedi sezione 5).

### Il pannello di dettaglio
Clicca una card (o il nome in tabella) per aprirlo. Chiudi con **✕**, con **Esc** o cliccando fuori. Puoi modificare:

- **Titolo** e **completamento** (cerchio con spunta a sinistra del titolo).
- **Status**: la colonna di stato.
- **Priority**: da 1 a 5 stelle (clicca la stessa stella per azzerare).
- **Assignee**: il responsabile. Ogni lista ha il suo elenco di persone: scrivi un nome e premi Invio per aggiungerlo, poi in tutti gli altri elementi della lista lo trovi già nell'elenco da cliccare.
- **Start date** e **Due date**: inizio (facoltativo; se manca vale il giorno di creazione) e scadenza. Servono anche alla vista Gantt, dove si possono cambiare trascinando le barre.
- **Estimate (days)**: durata stimata, confrontata con quella pianificata e con quella reale.
- **Milestone**: trasforma l'elemento in un traguardo (rombo sulla scadenza, durata zero).
- **Depends on**: i task che devono finire prima. Se sposti un predecessore, questo elemento slitta in avanti di conseguenza (mai all'indietro).
- **Reminders**: promemoria con data/ora (sezione 6).
- **Description**: testo libero. Gli indirizzi web diventano **link cliccabili**.
- **Subtasks**: sotto-attività con spunta. Scrivi il testo e premi Invio per aggiungerne una; **✕** per toglierla.
  - **💬 Commenti**: ogni sotto-attività ha un'icona 💬 (con il numero di commenti). Un tocco apre e richiude l'elenco.
  - **⋮⋮ Riordino**: trascina la maniglia a sinistra per cambiare l'ordine.
- **📈 Track progress** (accanto a Subtasks): per i task grossi. I sotto-task diventano **passi** con stato (da fare / in corso / in attesa / fatto), data e promemoria facoltativi, "aspetto chi" e commenti. Compare una barra di avanzamento a segmenti e la percentuale (anche sulla card). La scheda **Activity** è il diario automatico del task (passi, stati, scadenze, tuoi commenti), raggruppato per giorno. **Stop tracking** riporta i passi a sotto-task (si perdono stato, date e promemoria; il diario resta).
- **Tag**: uno o più per ciascun campo (sezione 4).
- **Delete item**: elimina l'elemento (chiede conferma).

### Sulle card e in tabella
- Il cerchio a sinistra del titolo segna l'elemento come **completato** (rimane barrato; gli elementi completati sono nascosti nelle viste che non li mostrano).
- Sulla card vedi priorità, avanzamento dei sottotask (es. ☑ 2/5), prossimo reminder 🔔, scadenza 📅 (in rosso se è passata) e tag.
- In **tabella** puoi cambiare stato, priorità, scadenza e tag direttamente nelle celle.

### Spostare gli elementi
**Trascina** una card (o una riga) in un'altra colonna o in un'altra posizione. Spostarla in una colonna ne cambia il valore corrispondente (per esempio lo stato, oppure la priorità se raggruppi per priorità). Sul telefono tieni premuto un istante prima di trascinare. Se la vista ha un **ordinamento** attivo, l'ordine manuale all'interno della colonna non è modificabile (si può comunque cambiare colonna).

## 4. Campi e tag

I **campi** (es. *Project*, *Scope*, *Client*) sono etichette personalizzabili condivise da tutte le liste; ogni campo ha le sue **scelte** colorate (i *tag*).

- **Assegnare un tag**: nel dettaglio, clicca le etichette del campo; se ne possono scegliere più d'una.
- **Nuovo tag**: scrivi nel campo **+ new tag** e premi Invio (viene assegnato subito).
- **Modificare i tag**: con la matita **✎** accanto al nome del campo puoi rinominare il campo, cambiare nome e colore dei tag, eliminarli o eliminare l'intero campo (con conferma).
- **Nuovo campo**: in fondo al dettaglio, **+ new tag field**, scrivi il nome e premi Invio.
- Nella tabella i tag si modificano cliccando la cella.

## 5. Viste, filtri, raggruppamento e ricerca

Una **vista** è un modo salvato di guardare la lista: layout, raggruppamento, filtri, ordinamento e campi visibili. Ne trovi già cinque: *Default* (board per stato), *Priority* (board per priorità), *Not done*, *Done*, *All items* (tabelle).

### Cambiare vista
Clicca il nome della vista (▤) nella barra degli strumenti. Dal menu ⋮ di ogni vista puoi **rinominarla**, impostarla come **predefinita** o **eliminarla**. **＋ Save current settings as new view** crea una nuova vista dalle impostazioni attuali.

### Modificare ciò che vedi: **⚙ Edit view**
- **Filter**: mostra solo gli elementi che *includono* o *escludono* certi valori (stato, priorità, scadenza, completato, o un tuo campo). I filtri attivi compaiono come pulsanti; **＋ Filter** ne aggiunge altri.
- **Sort**: ordina per nome, stato, priorità, scadenza, data di creazione o un campo. Cliccando di nuovo si inverte; **Remove sort** torna all'ordine manuale. Nella tabella si ordina anche cliccando le intestazioni.
- **Hide fields**: nasconde campi (priorità, scadenza, sottotask, reminder, descrizione, tag…) da card e tabella.
- **Group by**: raggruppa per stato, priorità, scadenza, completato o per un tuo campo; **Remove group by** mostra un unico gruppo. Si può cambiare anche dal pulsante **Group by** della barra.
- **Layout**: **Board** (colonne), **Table** (tabella), **Gantt** (linea del tempo) o **Dashboard** (statistiche). Vedi 5b.
- **Show completed items**: mostra anche gli elementi completati.

### Salvare o scartare le modifiche
Le modifiche alla vista sono provvisorie: finché non le salvi compare **"View modified"** con tre pulsanti:
- **Reset**: torna alla vista salvata;
- **Save view**: aggiorna la vista corrente;
- **Save as new**: crea una nuova vista.

La **ricerca** (casella "Search…") filtra per testo nel titolo e nella descrizione ed è provvisoria: non viene mai salvata nella vista.

### Colonne e gruppi
Quando raggruppi per stato o per un tuo campo, i gruppi sono **modificabili**:
- **+ Add group** aggiunge una colonna;
- **doppio clic** sul titolo (o menu **⋯ → Rename**) la rinomina;
- **⋯** permette anche di cambiarne il **colore** o di **eliminarla** (gli elementi di una colonna eliminata passano alla prima colonna rimasta; ne resta sempre almeno una);
- trascina la maniglia **⠿** per **riordinare** le colonne.

I gruppi di priorità, scadenza e completato sono fissi.

## 5b. Gantt e Dashboard

Scegli il layout da **⚙ Edit view → Layout** e salva la vista con **Save as new** per ritrovarla nel menu delle viste. Entrambe rispettano filtri, ricerca e raggruppamento della vista.

### Gantt
- Ogni elemento è una **barra** dall'inizio alla scadenza, con titolo e responsabile scritti sopra (se la barra è abbastanza larga). Verde = completato, rosso = in ritardo; la parte più scura è l'avanzamento (passi o sotto-task). La linea rossa verticale è **oggi**. Senza scadenza compare solo "◆ no due date".
- **Trascina la barra** per spostarla nel tempo, il **bordo sinistro** per cambiare l'inizio, il **bordo destro** per cambiare la scadenza. Le date vengono salvate nell'elemento. Avvicinandoti al bordo della schermata la linea del tempo scorre da sola. Un clic apre il dettaglio.
- **Frecce** = dipendenze (rosse se il successore inizia troppo presto). Spostando un predecessore, i successori slittano in avanti.
- **◆ Rombo** = milestone. Si trascina come le barre.
- **Linea sotto la barra** = durata stimata (arancione se la durata pianificata la supera).
- **⚑ Set baseline** congela le date attuali come "piano": sotto ogni barra compare una barra grigia sottile (rossa se la scadenza è slittata). **Reset baseline** la ricalcola, **Baseline** la mostra/nasconde, **✕** la cancella. Vale per tutti i task con scadenza della lista.
- **Days / Weeks / Months** cambia lo zoom, **Today** riporta alla data odierna.
- **⤓ PNG** scarica il diagramma come immagine; **⤓ PDF** apre la stampa (A4 orizzontale): scegli "Salva come PDF".

### Dashboard
Avanzamento complessivo in percentuale, indicatori (totale, completati, da fare, in ritardo, in scadenza entro 7 giorni, senza scadenza), ripartizione per stato, scadenze e priorità, dettaglio per gruppo, carico per responsabile, stime contro durata reale, scostamento dalla baseline, passi dei task con tracciamento, ed elenchi cliccabili dei task in ritardo e in arrivo. Include sempre i completati, altrimenti le percentuali non avrebbero senso.

## 6. Reminder (promemoria)

Nel dettaglio di un elemento, sezione **🔔 Reminders**:

- Scegli una scorciatoia (**In 1 hour, Tomorrow 9:00, In 1 week, In 1 month, Every month**) oppure **＋ Custom** e imposta tu data e ora.
- Per ogni reminder scegli la ripetizione: **Once, Every day, Every week, Every month, Every year**. Cambiando data/ora o ripetizione il reminder viene riarmato.
- Rimuovilo con **✕**.

**Quando scatta** (con l'app aperta): compare un avviso 🔔 in basso con i pulsanti **Open** (apre l'elemento), **10 min**, **1 h**, **Tomorrow** (rimandano il promemoria) e **✕**. Se concedi il permesso con **Enable system notifications**, arriva anche una notifica di sistema. I reminder dei task già completati non scattano.

**Con l'app chiusa**: collega Google Calendar (sezione 8) e il telefono ti avvisa lo stesso.

## 6b. Note (📝 Notes)

Ogni lista ha il suo **quaderno di note**, stile OneNote. Si apre con **📝 Notes** (in alto a destra o nella barra laterale) in una finestra che resta sopra la board.

- **Finestra**: trascinala dalla barra del titolo, ridimensionala dai bordi, riducila a barra (–), ingrandiscila (▢) o chiudila (✕). Con il pulsante ⇥ la **agganci al bordo destro** (pannello a tutta altezza, la board si restringe; la larghezza si cambia dal bordo sinistro); con ⧉ la rendi di nuovo flottante. Posizione, dimensione e modalità vengono ricordate.
- **Sezioni** (schede in alto) e **pagine** (elenco a sinistra): con **+** ne crei di nuove; puoi rinominare, eliminare e spostare su/giù le pagine.
- **Scrivere dove vuoi**: la pagina è una tela libera. Clicca in un punto vuoto e lì nasce una **casella di testo**; trascinala dalla maniglia che appare sopra (⋯), allargala dal bordo destro, eliminala con ✕ in alto. Le caselle vuote spariscono da sole.
- **Immagini**: incolla (Ctrl+V, anche una schermata), trascina un file sulla pagina o usa il pulsante 🖼. Le immagini vengono ridotte (max 1600 px) e salvate dentro la nota. Clicca un'immagine per **ridimensionarla** trascinando la maniglia in basso a destra (Canc la elimina).
- **Disegno a mano libera**: il pulsante ✏ apre un riquadro con penna (colore, spessore), gomma e Clear; con Insert il disegno entra nella nota come immagine (poi si può ridimensionare, ma non più modificare).
- **Editor** (agisce sulla casella in cui stai scrivendo): grassetto, corsivo, sottolineato, barrato, font e dimensione, colore testo ed evidenziatore, titoli, elenchi (Tab per annidare), allineamento, link, tabella. Incolla da Word, web o altri editor mantenendo la formattazione.
- **Esporta**: menu Export, per la pagina, la sezione o tutta la lista, in Word (.docx), PDF (si apre la stampa: scegli "Salva come PDF"), HTML, Markdown o testo.
- Le note si sincronizzano e finiscono nei backup come il resto dei dati.

## 6c. Tools (🧰 Tools)

Dalla barra laterale, **🧰 Tools** apre una sezione a schede con strumenti per decidere cosa fare e gestire il tempo (testi in inglese, brevi). Per tornare alla lista: **← Back** o clic su una lista.

- **Eisenhower**: matrice 2×2 urgente/importante. Aggiungi idee libere o scegli task della lista; trascina le voci tra i quadranti (o usa il numerino per spostarle). Le idee **non** entrano nella to-do list da sole: **→ To-do** le crea come task (priorità suggerita dal quadrante) e restano collegate. Le voci sono per lista.
- **MIT · 1-3-5**: scegli le priorità del giorno, da 1 a 3 (MIT) oppure 1 grande + 3 medie + 5 piccole. Ogni voce è testo libero o un task (spuntarla lo completa anche nella lista). Il giorno dopo si riparte da zero.
- **Pomodoro**: timer focus / pausa breve / pausa lunga con durate modificabili, suono e notifica a fine fase. Continua anche se cambi scheda; il tempo residuo appare nel titolo della pagina.
- **Guide for productivity**: guide brevi a sezioni (sistema in 4 passaggi, Pareto 80/20). Per aggiungerne basta un elemento in `GUIDES` di `Guides.svelte`.
- Per aggiungere un nuovo tool: componente `.svelte` + una riga in `TOOLS` di `Tools.svelte`.
- Le voci della matrice di Eisenhower sono sincronizzate su Drive e incluse nei backup. MIT · 1-3-5 e Pomodoro (durate, contatore) restano sul dispositivo e non vengono sincronizzati.

## 7. Impostazioni e aspetto (**⚙ Settings**)

- **Theme**: *Match system*, *Light*, *Dark*, *Claude theme*.
- **Interface size**, **Text size**, **Column width**, **Font**: per adattare l'app al tuo schermo e alla tua vista. **Reset appearance** ripristina i valori iniziali.
- Le larghezze della barra laterale e del pannello di dettaglio si regolano trascinandone il bordo.

## 8. Google Calendar: reminder anche ad app chiusa

1. Inserisci il tuo **OAuth Client ID** in Settings (come ottenerlo: SETUP.md, sezione C1).
2. Premi **Connect Google Calendar** e autorizza.
3. L'app crea un calendario dedicato **"To-Do Reminders"** e vi mette un evento per ogni reminder. Si aggiorna da solo quando modifichi i reminder.

Altri pulsanti: **Reconnect** (rinnova il login), **Sync now**, **Recreate calendar** (se hai cancellato il calendario in Google Calendar), **Disconnect** (gli eventi già creati restano finché non elimini il calendario).

**Privacy**: su Google Calendar compare "To-do reminder" senza il testo. Attiva **Show task titles in Google Calendar** solo se vuoi vedere i titoli (che così Google potrà leggere).

## 9. Backup e sincronizzazione

I tuoi dati stanno **nel browser di quel dispositivo**: cancellare i "cookie e dati dei siti", usare un altro browser o reinstallare il sistema li fa sparire. Proteggili in uno (o entrambi) questi modi.

### Backup su file cifrato
In **Settings → Backup** scegli una passphrase (almeno 8 caratteri):
- **Export encrypted backup** scarica un file `.todo-backup.json` (conservalo insieme alla sua passphrase);
- **Import backup…** ripristina un file: **sostituisce tutti i dati del dispositivo** (chiede conferma).

Settings indica anche se il browser ha concesso l'**archiviazione persistente** (protegge i dati se il disco si riempie).

### Sincronizzazione cifrata tra dispositivi (Google Drive)
I dati vengono **cifrati sul tuo dispositivo** prima di salire su Drive (cartella nascosta riservata all'app): Google non può leggerli. Serve il Client ID inserito come sopra.

- **Primo dispositivo**: in **Encrypted sync** scegli una passphrase di **almeno 12 caratteri** (ad esempio 4-5 parole casuali), ripetila e premi **Create encrypted vault**. Viene mostrata **una sola volta** la **recovery key**: salvala in un password manager o su carta e spunta la conferma. **Senza passphrase e recovery key i dati nel cloud non sono recuperabili.**
- **Altri dispositivi**: inserisci Client ID e la stessa passphrase, poi **Unlock existing vault** (oppure spunta "Unlock with recovery key instead" e usa la chiave di recupero). Meglio partire da un dispositivo vuoto: scarica i dati dal cloud.
- **Sync frequency**: *Automatic* (pochi secondi dopo ogni modifica e ogni minuto), a intervalli (15 min, 1 h, 6 h, 1 giorno) o solo manuale con **Sync now**. La sincronizzazione avviene **solo mentre l'app è aperta**.
- Se due dispositivi modificano **lo stesso elemento** insieme, vince la modifica più recente.
- **Lock / forget key on this device** dimentica la chiave su quel dispositivo (i dati nel cloud restano; per riconnetterti serve la passphrase).

### L'indicatore in basso nella barra laterale
- **Grigio – "Sync off"**: nessuna sincronizzazione attiva.
- **Verde – "Synced hh:mm" / "Syncing…"**: tutto funziona.
- **Giallo – "Not synced — reconnect" o "Sync problem"**: il login Google è scaduto (dura 1 ora) o c'è un errore. Clicca un punto qualsiasi dell'app per rinnovare il login con un breve popup, oppure apri Settings e usa **Reconnect / Sync now**.

## 10. Usare l'app su PC e telefono

- **PC**: apri l'app in Chrome o Edge e installala (**Installa app**): si apre in una finestra propria con un'icona.
- **Android**: Chrome → ⋮ → **Installa app**. L'interfaccia si adatta allo schermo (barra delle liste a scomparsa con ☰, colonne scorrevoli).
- Dopo il primo caricamento l'app **funziona anche offline**.
- Quando esce una nuova versione, apri l'app con internet e richiudila/riaprila (una o due volte); se non cambia, ricarica con Ctrl+Shift+R.

## 11. Domande frequenti

**Ho perso i dati dopo aver pulito il browser.** Se avevi attivato la sync su Drive o un backup, ripristina con *Unlock existing vault* (altro dispositivo o stesso dopo la pulizia) o *Import backup…*. Altrimenti i dati locali non sono recuperabili.

**I dati sul mio PC non compaiono sul telefono.** I due dispositivi hanno archivi separati: attiva la sync cifrata su entrambi con lo stesso Client ID e la stessa passphrase.

**Non vedo più gli elementi completati.** Sono nascosti nelle viste che non li mostrano: attiva **Show completed items** in *Edit view* oppure usa le viste *Done* o *All items*.

**Un elemento non compare in una vista.** Controlla filtri attivi e ricerca: i pulsanti dei filtri sono evidenziati quando hanno valori selezionati.

**Il reminder non suona su Android a app chiusa.** Collega Google Calendar (sezione 8) e verifica che le notifiche del calendario "To-Do Reminders" siano attive e che il risparmio energetico non limiti Google Calendar (vedi SETUP.md, B5).

**Ho cancellato il calendario "To-Do Reminders".** In Settings premi **Recreate calendar**.

**Ho dimenticato la passphrase.** Usa la **recovery key** (*Unlock with recovery key instead*). Se hai perso entrambe, i dati nel cloud non si possono recuperare.

**Quanto sono sicuri i miei dati?** Sul cloud sono cifrati (AES-256) con una chiave che Google non conosce. Sul dispositivo, invece, i dati nel browser non sono cifrati a riposo e l'app non ha un blocco automatico: proteggi il PC con la password di Windows e il telefono con il blocco schermo.

**Google mi chiede sempre di riconnettermi.** Il login dura solo 1 ora se manca il "login duraturo". Controlla che in Settings → Sign-in server ci sia l'indirizzo del Worker (SETUP.md, C3), poi premi **Disconnect** e **Connect** e accetta il consenso di Google. Se compare *"Google gave no long-lived login"*, rimuovi "toDo" da myaccount.google.com/permissions e ripeti. Va rifatto **una volta su ogni dispositivo** (anche sulla PWA installata, che ha storage separato dal browser). Se il problema torna dopo circa 7 giorni, l'app Google è in stato "Test": in Google Cloud Console passala a **In produzione**. Dettagli tecnici per la diagnosi nel README.

**Qual è l'indirizzo del Sign-in server?** L'indirizzo ha la forma `https://todo-auth.<tuo-account>.workers.dev` (da incollare in Settings → Sign-in server). Quello esatto lo stampa `npx wrangler deploy` dalla cartella `worker/`.
