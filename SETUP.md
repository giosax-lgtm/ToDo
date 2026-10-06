# Setup: hosting, Google Calendar (reminder) e Drive

**Nessun server da gestire.** L'app è un sito statico: i dati stanno nel tuo browser (IndexedDB).
Google serve solo per i reminder (Calendar) e, nel prossimo passo, per il sync cifrato (Drive).

## 1. Provare in locale

```
cd app
npm install
npm run dev        # http://localhost:5173
```

## 2. Pubblicare gratis (serve per usarla anche dal telefono)

Scegli **una** opzione. Il sito deve essere in HTTPS (lo è su entrambe).

### A) GitHub Pages (workflow già pronto in `.github/workflows/deploy.yml`)
1. Crea un repository **privato o pubblico** su GitHub (il codice non contiene dati) e attiva il 2FA sull'account.
2. Nella cartella del progetto: `git init`, `git add .`, `git commit -m "init"`, collega il repo e fai `git push` sul branch `main`.
3. Su GitHub: **Settings → Pages → Source: GitHub Actions**. Dopo il primo workflow l'URL sarà `https://<utente>.github.io/<repo>/`.
   (I repo privati su Pages richiedono un piano a pagamento: usa un repo pubblico oppure l'opzione B.)

### B) Cloudflare Pages (gratis, repo privato ok)
1. `cd app && npm run build`.
2. dash.cloudflare.com → **Workers & Pages → Create → Pages → Upload assets** → carica la cartella `app/dist`.
3. L'URL sarà `https://<nome>.pages.dev`.

Annota l'URL finale: ti serve al punto 3.

## 3. Google Cloud: Client ID (una tantum, gratis)

1. Vai su <https://console.cloud.google.com> e accedi con il tuo account Google.
2. **Crea un progetto** (es. "todo-app").
3. **API e servizi → Libreria**: abilita **Google Calendar API** (e, per il sync futuro, **Google Drive API**).
4. **API e servizi → Schermata consenso OAuth** (o "Google Auth platform"):
   - Tipo utente: **Esterno**; nome app "toDo"; email tua come contatto.
   - **Ambiti (Scopes)**: aggiungi `.../auth/calendar.app.created` (e in futuro `.../auth/drive.appdata`).
   - Stato pubblicazione: **Pubblica app (In produzione)**. Per uso personale non serve la verifica Google: vedrai solo l'avviso "app non verificata" al primo accesso (Avanzate → Vai a toDo).
     Se la lasci in "Test", il consenso scade ogni 7 giorni e dovrai aggiungerti come utente di test.
5. **Credenziali → Crea credenziali → ID client OAuth → Applicazione web**:
   - **Origini JavaScript autorizzate**: `http://localhost:5173` e l'URL del sito pubblicato (solo origine, senza percorso, es. `https://utente.github.io`).
   - URI di reindirizzamento: non servono.
6. Copia il **Client ID** (`xxxx.apps.googleusercontent.com`). Non è un segreto, ma non serve nessun "client secret".

## 4. Collegare l'app

1. Apri l'app → **⚙ Settings** (in basso nella barra a sinistra).
2. Incolla il Client ID → **Connect Google Calendar** → accetta il consenso.
3. L'app crea il calendario **"To-Do Reminders"** e ci sincronizza i reminder (creazione, modifica, cancellazione automatiche).
4. Per impostazione predefinita su Calendar compare il titolo generico "To-do reminder": Google non vede il testo dei tuoi task. Puoi attivare "Show task titles" se preferisci notifiche descrittive.

## 5. Sul telefono Android

1. Apri l'URL del sito in Chrome → menu ⋮ → **Installa app**.
2. Installa/apri l'app **Google Calendar** con lo stesso account: il calendario "To-Do Reminders" appare da solo.
3. In Calendar → Impostazioni → *To-Do Reminders* → **Notifiche attive**. (L'app imposta già un avviso all'ora dell'evento.)
4. **Test importante:** crea un reminder tra 2 minuti, **deseleziona** il calendario nella lista (così non lo vedi nella griglia) e verifica che la notifica arrivi lo stesso. Se non arriva, lascia il calendario visibile con un colore discreto.
5. Disattiva il risparmio energetico aggressivo per Google Calendar se le notifiche arrivano in ritardo.

## Note di sicurezza
- Il token Google resta solo in memoria e dura 1 ora; si rinnova da solo finché sei loggato su Google nel browser, altrimenti premi *Reconnect*.
- Scope minimo: l'app può gestire **solo il calendario che ha creato**, non i tuoi altri calendari.
- Se disconnetti l'app, gli eventi già creati restano su Google Calendar (cancellabili eliminando il calendario "To-Do Reminders").
- Il sync cifrato dei dati su Drive (passphrase, AES-GCM) è il prossimo passo.
