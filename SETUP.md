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

## A3. Aggiornare l'app (dopo ogni nuova versione del codice)
L'app che vedi è quella costruita l'ultima volta: dopo una modifica al codice va **ricostruita**.
1. Chiudi il terminale di `avvia-todo.bat` (se è aperto).
2. Rilancia **`avvia-todo.bat`**: ricostruisce l'app e riavvia il server.
3. Apri `http://localhost:4173` nel browser e ricarica forzando con **Ctrl+Shift+R** (ricarica ignorando la cache).
4. App installata (icona): con il server acceso apri una volta il sito nel browser, poi chiudi e riapri l'app installata (a volte serve riaprirla due volte per vedere la novità).
I dati non si perdono: restano nel browser. **Non cambiare la porta (4173)**, altrimenti l'indirizzo cambia e i dati sembrano spariti.

## A4. Backup (consigliato)
Senza Google, l'unica copia dei dati è nel browser di quel PC. Proteggila:
- **File di backup**: ⚙ Settings → *Backup* → *Export encrypted backup* (passphrase a tua scelta). Salva il file su OneDrive/Drive/chiavetta. *Import backup* lo ripristina (sostituisce i dati del dispositivo).
- **Backup/sync automatico su Drive** (facoltativo, spento di default; si disattiva da ⚙ Settings): serve il Client ID Google (sezione **Comune → C1**), poi ⚙ Settings → *Encrypted sync* (sezione C2). Nel Client ID autorizza l'origine `http://localhost:4173`.

## A5. Cosa perde i dati (solo locale)
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

**Cloudflare Pages** (gratis, repo privato ok): due modi
- **Automatico da GitHub (consigliato)**: ogni `git push` ripubblica da solo. Procedura completa in **B6**.
- **Manuale**: `cd app && npm run build`, poi dash.cloudflare.com → **Workers & Pages → Create → Pages → Upload assets** → carica `app/dist`. Non si può convertire poi nel modo automatico: per cambiare modo serve un nuovo progetto.

In entrambi i casi l'URL sarà `https://<nome>.pages.dev`.

Annota l'URL: serve in C1 (come origine autorizzata).

## B2. Collegare Google
Segui la sezione **Comune (C1, C2)** qui sotto.

## B2b. Aggiornare la versione online
- **GitHub Pages**: fai `git push` sul branch `main`; il workflow ricostruisce e ripubblica da solo (1-2 minuti).
- **Cloudflare Pages (collegato a GitHub, B6)**: `git push` su `main`; Cloudflare ricostruisce e ripubblica da solo.
- **Cloudflare Pages (manuale)**: `cd app && npm run build`, poi ricarica la cartella `app/dist` su Cloudflare.
- Sui dispositivi: apri l'app (con internet) e chiudila/riaprila una o due volte; l'app si aggiorna da sola. Se non cambia, ricarica con Ctrl+F5 (PC).

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

## B6. Passare da GitHub Pages a Cloudflare Pages, con repo GitHub privato (tutto gratis)

**Come funziona.** Il codice resta su GitHub, in un repo **privato** (gratis: GitHub Free ammette repo privati illimitati; a pagamento è solo *GitHub Pages* da repo privato). La pubblicazione passa a **Cloudflare Pages**, che legge il repo tramite la sua app GitHub e ricostruisce il sito a ogni `git push`. Cloudflare non ospita il codice: custodisce solo il sito costruito.

**Attenzione: l'indirizzo cambia e i dati nel browser sono legati all'indirizzo.** `https://<utente>.github.io` e `https://<nome>.pages.dev` sono archivi separati: sul nuovo sito l'app parte vuota finché non ripristini i dati. Per questo il vecchio sito si spegne solo alla fine. Se hai un dominio tuo, usalo: l'indirizzo non cambierà mai più, qualunque hosting userai in futuro.

### Fase 1: prepara (il sito GitHub continua a funzionare)
1. **Backup**: ⚙ Settings → *Backup* → *Export encrypted backup* e salva il file. Verifica di avere passphrase del sync e recovery key.
2. **Cloudflare**: dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** → autorizza l'app GitHub **solo sul repo del progetto** → scegli il repo.
3. Impostazioni di build:

   | Campo | Valore |
   |---|---|
   | Production branch | `main` |
   | Root directory | `app` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Variabile d'ambiente | `NODE_VERSION` = `22` |

   Premi *Save and Deploy*. L'URL sarà `https://<nome>.pages.dev` (con un dominio tuo: *Custom domains* nel progetto).

   **Se la dashboard mostra invece la schermata "Set up your application"** (Cloudflare ora crea un Worker con file statici): lascia `Build command` = `npm run build`, `Deploy command` = `npx wrangler deploy`, e in *Advanced settings* `Path` = `/app`. Il file `app/wrangler.jsonc` dice a wrangler di pubblicare `dist`; il *Project name* deve coincidere con il campo `name` di quel file (`todo`). `NODE_VERSION` = `22` si aggiunge nelle variabili di build. L'URL sarà `https://<nome>.<tuo-account>.workers.dev`.
4. **Google Cloud Console** → Credenziali → il tuo ID client → *Origini JavaScript autorizzate*: **aggiungi** il nuovo indirizzo (solo origine, senza percorso). Non togliere ancora quella di GitHub.
5. **Worker di login** (C3): in `worker/wrangler.toml` aggiungi il nuovo indirizzo a `ALLOWED_ORIGINS` (separato da virgola, senza togliere quello vecchio), poi da `worker/` esegui `npx wrangler deploy`.

### Fase 2: prova il nuovo sito (in parallelo al vecchio)
1. Apri l'indirizzo `pages.dev` in Chrome. L'app è vuota: è normale.
2. ⚙ Settings → incolla Client ID e Sign-in server → *Connect*. Poi *Encrypted sync* → *Unlock existing vault* con la passphrase: i dati tornano dal cloud. In alternativa *Import backup*.
3. Controlla: task e note presenti, sync che funziona, reminder su Calendar, login che non chiede di riconnettersi dopo un'ora.
4. Installa la PWA dal nuovo indirizzo su PC e Android (installa e prova prima di togliere la vecchia).
5. Per qualche giorno usa il nuovo sito e lascia il vecchio come rete di sicurezza.

### Fase 3: spegni GitHub Pages e rendi privato il repo (solo quando tutto funziona)
1. Elimina `.github/workflows/deploy.yml` (altrimenti fallirebbe a ogni push) e fai commit e push.
2. Su GitHub: repo → **Settings → Pages**: disattiva la pubblicazione. Poi **Settings → General → Danger Zone → Change visibility → Make private**. Da riga di comando: `gh repo edit <utente>/<repo> --visibility private --accept-visibility-change-consequences`.
3. Verifica che Cloudflare continui a costruire: fai un piccolo push e controlla il deployment. Se l'accesso al repo è stato revocato, ripeti l'autorizzazione dell'app GitHub.
4. In Google Cloud Console e in `ALLOWED_ORIGINS` puoi togliere l'indirizzo `github.io`.
5. Svuota i dati del vecchio sito e disinstalla la vecchia PWA, per non confonderti.

### Cose da sapere
- **Il codice resta visibile a chi apre il sito**: un repo privato nasconde il sorgente, non il JavaScript servito al browser. I tuoi dati non sono comunque esposti (stanno nel browser e cifrati su Drive).
- `pages.dev` è raggiungibile da chiunque abbia l'URL. Proteggerlo con Cloudflare Access è possibile ma può rompere service worker, installazione PWA e uso offline: sconsigliato.
- La cronologia Git è stata pubblica: fork e cloni già fatti restano. Nel repo non risultano segreti (solo il Client ID Google, che non è un segreto).
- Rollback: finché non fai la Fase 3 puoi tornare semplicemente al vecchio indirizzo.

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

## C3. Login duraturo (facoltativo, consigliato): non dover rifare il login ogni ora
Senza questo passo il token Google dura 1 ora e va rinnovato con un popup. Con un piccolo **Worker Cloudflare gratuito** (cartella `worker/`) fai il login **una volta** e l'app si rinnova da sola, su PC e telefono. Il Worker custodisce il *client secret* e non salva né vede i tuoi dati.
1. In Google Cloud Console → **Credenziali** → apri il tuo ID client OAuth e copia il **Client secret** (qui, a differenza di C1, serve).
2. Account Cloudflare gratuito. Poi da terminale:
   ```
   cd worker
   npx wrangler login
   ```
3. Apri `worker/wrangler.toml` e imposta `GOOGLE_CLIENT_ID` e `ALLOWED_ORIGINS` (le stesse origini di C1, es. `https://utente.github.io,http://localhost:4173`).
4. Carica il secret e pubblica:
   ```
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler deploy
   ```
   Il comando stampa l'indirizzo, es. `https://todo-auth.<tuo-nome>.workers.dev`.
5. Nell'app: ⚙ Settings → Google Calendar → **Sign-in server** → incolla l'indirizzo. Poi **Disconnect** e **Connect** (su ogni dispositivo, una volta).
6. Se dopo il Connect compare *"Google gave no long-lived login"*: Google non ripropone il consenso a chi ha già autorizzato l'app. Rimuovi "toDo" da <https://myaccount.google.com/permissions> e ripeti Connect.
7. Il refresh token resta nel browser del dispositivo (come l'access token). Scade solo se lo revochi, cambi la password Google o l'app resta in stato "Test" (vedi C1: deve essere *In produzione*).

---

# Git e GitHub: salvare le modifiche e tenere tutto sincronizzato

Il codice sta in due posti: la cartella sul PC (repo locale) e GitHub (repo remoto, chiamato `origin`). Il branch si chiama `main`. I tuoi **dati** (task) non c'entrano: stanno nel browser e nel backup cifrato su Drive.

## G1. Impostazione una tantum
```
git config user.name  "tuo-username-github"
git config user.email "ID+tuo-username@users.noreply.github.com"
```
L'email `noreply` si trova su GitHub in Settings → Emails. Così la tua vera email non finisce nei commit. Attiva lì anche *Keep my email addresses private* e *Block command line pushes that expose my email*.

Collegare il repo locale a GitHub (solo la prima volta, se non c'è già `origin`):
```
git remote add origin https://github.com/<utente>/<repo>.git
git branch -M main
git push -u origin main
```
Al primo push si apre il login GitHub nel browser. Poi le credenziali restano salvate.

## G2. Ogni volta che modifichi qualcosa
Dalla cartella del progetto:
```
git status                      # vedi cosa è cambiato
git add .                       # prepara tutte le modifiche
git commit -m "cosa ho cambiato"
git push                        # invia su GitHub
```
Con GitHub Pages, il push avvia da solo il deploy: dopo 1-2 minuti la versione online è aggiornata (stato in *Actions* sul repo). In VS Code puoi fare lo stesso dal pannello *Source Control*: scrivi il messaggio, **Commit**, poi **Sync Changes**.

## G3. Tenere PC e GitHub allineati
- **Prima di iniziare a lavorare** (soprattutto se hai modificato da un altro PC o da GitHub): `git pull`
- **Dopo aver finito**: `git add .`, `git commit`, `git push`
- Controllo rapido: `git status -sb`
  - `ahead N`: hai N commit da inviare, quindi fai `git push`
  - `behind N`: su GitHub ci sono N commit nuovi, quindi fai `git pull`
  - nessuna indicazione: sei allineato
- Se `git push` dice *rejected / non-fast-forward*, su GitHub c'è qualcosa che non hai in locale: fai `git pull` (risolvi eventuali conflitti, poi commit) e ripeti `git push`.
- Lavora su un solo PC alla volta, oppure fai sempre `pull` prima e `push` dopo, per evitare conflitti.

## G4. Cosa non committare
- Mai password, token, chiavi o file di backup (`*.todo-backup.json`). Il Client ID Google non è un segreto, ma l'app lo legge dalle impostazioni e non dal codice.
- `node_modules` e `dist` sono già esclusi dal `.gitignore`. `Screenshots/` anche.
- Evita `git push --force`: serve solo in casi eccezionali, come riscrivere la cronologia, e sovrascrive quello che c'è su GitHub.

## G5. Nuovo PC o ripartenza da zero
```
git clone https://github.com/<utente>/<repo>.git
cd <repo>/app
npm install
npm run serve
```
I task si recuperano con il sync cifrato (C2, punto 4) o con un file di backup.

---

# Combinare A e B
Puoi usare `localhost` sul PC e il sito pubblicato sul telefono: sono archivi separati, ma con lo stesso Client ID e la stessa passphrase il sync cifrato li allinea.

# Note di sicurezza
- Il token Google (scope minimi) dura 1 ora e resta nel browser solo fino alla scadenza, così un refresh non richiede un nuovo login. Senza il *Sign-in server* (C3), alla scadenza il primo clic o tocco nell'app lo rinnova con un breve popup di Google; in alternativa usa *Reconnect* in Settings. Con C3 attivo il rinnovo è silenzioso: nel browser resta anche un *refresh token* (revocabile con Disconnect o da myaccount.google.com/permissions), che da solo non serve senza il client secret custodito nel Worker.
- Scope minimo: l'app gestisce **solo il calendario che ha creato** e una cartella Drive nascosta riservata all'app.
- Disconnettendo l'app, gli eventi già creati restano su Calendar (eliminali cancellando il calendario "To-Do Reminders").
- **Cifratura**: dati compressi e cifrati con AES-256-GCM sul dispositivo prima di andare su Drive; la chiave è protetta dalla passphrase (PBKDF2-SHA256, 600.000 iterazioni) e da una recovery key casuale. Google vede solo file illeggibili.
- **Non ancora cifrato**: i dati locali nel browser (IndexedDB) non sono cifrati a riposo e non c'è l'auto-lock: proteggi il PC con la password di Windows e il telefono con il blocco schermo.
