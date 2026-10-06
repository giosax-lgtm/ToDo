# toDo: guida all'installazione

**Nessun server da gestire.** L'app è un sito statico: i dati stanno nel browser (IndexedDB) e, se vuoi, una copia **cifrata** sta nella cartella nascosta di Google Drive.

Scegli come usarla (puoi anche combinare le due, vedi la fine):

| | **Parte A: Standalone sul PC** | **Parte B: Online (GitHub + Drive): PC + Android** |
|---|---|---|
| Dove gira | `localhost` sul tuo PC | sito pubblicato in HTTPS |
| Account necessari | nessuno (Google solo se vuoi backup/sync/reminder) | GitHub (o Cloudflare) + Google |
| Telefono | no | sì |
| Sync tra dispositivi | no (solo backup) | sì |

---

# Parte A: Uso standalone sul PC

## A1. Prima installazione (una tantum)
1. Installa [Node.js](https://nodejs.org) (versione LTS).
2. Doppio clic su **`avvia-todo.bat`** nella cartella del progetto. Fa da solo `npm install`, costruisce l'app e la avvia su **http://localhost:4173** (apre il browser).
   In alternativa, da terminale: `cd app`, `npm install`, `npm run serve`.
3. Lascia aperta la finestra del terminale finché non hai finito il punto A2.

## A2. Installare come app (icona sul desktop, finestra separata)
1. Con l'app aperta su `http://localhost:4173` in Chrome o Edge:
   - **Chrome**: icona *Installa* ⊕ a destra nella barra degli indirizzi, oppure ⋮ → *Trasmetti, salva e condividi* → **Installa pagina come app**.
   - **Edge**: ⋯ → **App** → **Installa questo sito come app**.
2. Si apre una finestra separata senza barre del browser, con icona nella barra delle applicazioni.
3. Icona sul desktop: nella finestra dell'app ⋮ → *Crea collegamento sul desktop* (o da `chrome://apps` / `edge://apps` → clic destro → *Crea collegamento*).
4. Avvio con Windows (facoltativo): clic destro sull'app installata → *Impostazioni app* → *Avvia all'accesso*.

**Uso quotidiano:** clicchi solo l'icona. L'app installata tiene una copia di sé nel browser, quindi dovrebbe aprirsi anche con il server spento (non è garantito: se non si apre, avvia `avvia-todo.bat`). Il server serve solo per la prima installazione e per gli **aggiornamenti** dell'app: rilancia `avvia-todo.bat` dopo aver ricevuto una nuova versione.

## A3. Backup (consigliato)
Senza Google, l'unica copia dei dati è nel browser di quel PC. Proteggila:
- **File di backup**: ⚙ Settings → *Backup* → *Export encrypted backup* (passphrase a tua scelta). Salva il file su OneDrive/Drive/chiavetta. *Import backup* lo ripristina (sostituisce i dati del dispositivo).
- **Backup/sync automatico su Drive**: serve il Client ID Google (sezione **Comune → C1**), poi ⚙ Settings → *Encrypted sync* (sezione C2). Nel Client ID autorizza l'origine `http://localhost:4173`.

## A4. Cosa perde i dati (solo locale)
- "Cancella dati di navigazione" con **"Cookie e altri dati dei siti"** spuntato (la sola cache non tocca i dati).
- Finestra in incognito, altro profilo o altro browser, reinstallazione di Windows/browser.
- Cambiare indirizzo o porta (`localhost:4173` ≠ `localhost:5173` ≠ sito pubblicato): sono archivi separati.
- Disco pieno: ⚙ Settings → *Backup* mostra se l'archiviazione persistente è concessa.

---

# Parte B: Online (GitHub + Drive), PC + Android

## B1. Pubblicare gratis
Scegli **una** opzione (HTTPS incluso).

**GitHub Pages** (workflow già pronto in `.github/workflows/deploy.yml`)
1. Crea un repository su GitHub (il codice non contiene dati) e attiva il 2FA.
2. Nella cartella del progetto: `git init`, `git add .`, `git commit -m "init"`, collega il repo e `git push` sul branch `main`.
3. **Settings → Pages → Source: GitHub Actions**. L'URL sarà `https://<utente>.github.io/<repo>/`.
   (I repo privati su Pages richiedono un piano a pagamento: usa un repo pubblico oppure Cloudflare.)

**Cloudflare Pages** (gratis, repo privato ok)
1. `cd app && npm run build`.
2. dash.cloudflare.com → **Workers & Pages → Create → Pages → Upload assets** → carica `app/dist`.
3. L'URL sarà `https://<nome>.pages.dev`.

Annota l'URL: serve in C1 (come origine autorizzata).

## B2. Collegare Google
Segui la sezione **Comune (C1, C2)** qui sotto.

## B3. Installare su PC
Apri l'URL pubblicato in Chrome/Edge e installa come in **A2** (stessi passi, ma dall'URL del sito).

## B4. Installare su Android (Chrome)
1. Apri l'URL del sito in Chrome → ⋮ → **Installa app** (o *Aggiungi a schermata Home* → *Installa*).
2. Compare l'icona e si apre a schermo intero senza barra del browser. L'interfaccia si adatta da sola (barra liste a scomparsa con ☰, colonne scorrevoli).
3. Dimensioni e font regolabili in ⚙ Settings.
4. Nell'app inserisci il Client ID e la stessa passphrase: *Unlock existing vault* (C2).

## B5. Notifiche reminder su Android
1. Installa/apri **Google Calendar** con lo stesso account: il calendario "To-Do Reminders" appare da solo.
2. Calendar → Impostazioni → *To-Do Reminders* → **Notifiche attive** (l'app imposta già un avviso all'ora dell'evento).
3. **Test importante:** crea un reminder tra 2 minuti, **deseleziona** il calendario nella lista e verifica che la notifica arrivi lo stesso. Se non arriva, lascia il calendario visibile con un colore discreto.
4. Disattiva il risparmio energetico aggressivo per Google Calendar se le notifiche ritardano.

---

# Comune: Google (serve per backup/sync su Drive e reminder su Calendar)

## C1. Client ID (una tantum, gratis)
1. <https://console.cloud.google.com> → accedi → **crea un progetto** (es. "todo-app").
2. **API e servizi → Libreria**: abilita **Google Calendar API** e **Google Drive API**.
3. **Schermata consenso OAuth** (o "Google Auth platform"):
   - Tipo utente **Esterno**; nome "toDo"; email tua.
   - **Ambiti**: `.../auth/calendar.app.created` e `.../auth/drive.appdata`.
   - Stato: **Pubblica app (In produzione)**. Per uso personale non serve la verifica Google: al primo accesso vedrai "app non verificata" (Avanzate → Vai a toDo). In stato "Test" il consenso scade ogni 7 giorni.
4. **Credenziali → ID client OAuth → Applicazione web**, **Origini JavaScript autorizzate** (solo origine, senza percorso), puoi metterle tutte sullo stesso Client ID:
   - Parte A: `http://localhost:4173`
   - Parte B: l'URL pubblicato, es. `https://utente.github.io`
   - Non servono URI di reindirizzamento.
5. Copia il **Client ID** (`xxxx.apps.googleusercontent.com`). Non è un segreto e non serve nessun "client secret".

## C2. Collegare l'app
1. ⚙ Settings (in basso a sinistra) → incolla il Client ID.
2. **Reminder**: *Connect Google Calendar* → consenso. Si crea il calendario **"To-Do Reminders"** e i reminder si sincronizzano da soli. Su Calendar compare il titolo generico "To-do reminder", quindi Google non vede il testo dei task (puoi attivare "Show task titles").
3. **Sync cifrato, primo dispositivo**: in *Encrypted sync* scegli una passphrase di almeno 12 caratteri (es. 4-5 parole casuali), ripetila, premi *Create encrypted vault*. Ti viene mostrata **una sola volta la recovery key**: salvala in un password manager o su carta. Senza passphrase e recovery key i dati sul cloud non sono recuperabili.
4. **Altri dispositivi** (o stesso PC dopo una cancellazione dei dati): Client ID + stessa passphrase → *Unlock existing vault*. Un dispositivo vuoto scarica i dati dal cloud; se aveva già dati propri vengono uniti (meglio usare un dispositivo pulito).
5. Il sync parte pochi secondi dopo ogni modifica, ogni minuto e all'apertura. Se due dispositivi modificano lo **stesso item** insieme, vince la modifica più recente.

---

# Combinare A e B
Puoi usare `localhost` sul PC e il sito pubblicato sul telefono: sono archivi separati, ma con lo stesso Client ID e la stessa passphrase il sync cifrato li allinea.

# Note di sicurezza
- Il token Google resta solo in memoria e dura 1 ora; si rinnova da solo finché sei loggato su Google nel browser, altrimenti premi *Reconnect*.
- Scope minimo: l'app gestisce **solo il calendario che ha creato** e una cartella Drive nascosta riservata all'app.
- Disconnettendo l'app, gli eventi già creati restano su Calendar (eliminali cancellando il calendario "To-Do Reminders").
- **Cifratura**: dati compressi e cifrati con AES-256-GCM sul dispositivo prima di andare su Drive; la chiave è protetta dalla passphrase (PBKDF2-SHA256, 600.000 iterazioni) e da una recovery key casuale. Google vede solo file illeggibili.
- **Non ancora cifrato**: i dati locali nel browser (IndexedDB) non sono cifrati a riposo e non c'è l'auto-lock: proteggi il PC con la password di Windows e il telefono con il blocco schermo.
