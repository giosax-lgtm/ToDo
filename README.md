# toDo

To-do list personale in stile kanban, privata e senza server. È una PWA: si installa come app su PC e Android.

## Caratteristiche
- Board kanban con liste, colonne e tag, più vista tabella
- Sottotask, link cliccabili, reminder
- Tema chiaro, scuro o di sistema
- I dati restano nel browser (IndexedDB)
- Backup e sync **opzionali e cifrati** nella cartella nascosta di Google Drive. La cifratura avviene nel browser e la passphrase non lascia mai il dispositivo
- Reminder opzionali tramite un calendario dedicato su Google Calendar
- Funziona anche offline dopo il primo caricamento

## Privacy
Il repository contiene solo il codice. Nessun dato, chiave o credenziale è incluso: il Google Client ID e la passphrase li inserisce l'utente nell'app e restano sul suo dispositivo.

## Licenza
Codice sotto [PolyForm Noncommercial 1.0.0](LICENSE): puoi leggerlo, usarlo e modificarlo per uso personale e non commerciale; l'uso commerciale richiede il permesso dell'autore.

## Stack
Svelte 5, TypeScript, Vite, Dexie, vite-plugin-pwa.

## Sviluppo
```
cd app
npm install
npm run dev      # sviluppo
npm test         # test
npm run serve    # build + anteprima su http://localhost:4173
```

## Documentazione
- [GUIDA_UTENTE.md](GUIDA_UTENTE.md): funzionalità e uso dell'app
- [ARCHITETTURA.md](ARCHITETTURA.md): architettura e istruzioni per chi modifica il codice

## Installazione e deploy
Vedi [SETUP.md](SETUP.md) (uso sul PC, pubblicazione online e installazione su Android).

## Risoluzione problemi: Google chiede sempre di riconnettersi
Succede quando nel browser c'è solo il token di accesso (dura 1 ora) e manca il refresh token. Come verificare:
1. **Settings → Sign-in server** deve contenere l'URL del Worker (vedi [SETUP.md](SETUP.md), C3). Aprire l'URL a mano dà `Forbidden` (403): è normale, il Worker risponde solo all'app.
2. **F12 → Application → Local storage → `https://<tuo-utente>.github.io`**: deve esserci `todo.grefresh` (refresh token) oltre a `todo.gtoken` (access token). Se manca, il login è stato fatto prima del Worker o Google non ha dato il token di lunga durata.
3. Rimedio: **Disconnect → Connect** e accettare il consenso. Se compare *"Google gave no long-lived login"*, rimuovere "toDo" da <https://myaccount.google.com/permissions> e ripetere.
4. Rifarlo **su ogni dispositivo** (il refresh token vive nel `localStorage` di quel browser). Una PWA installata ha spesso storage separato dal browser: login anche lì.
5. Se il token sparisce dopo ~7 giorni: l'app Google è in stato "Test". In Google Cloud Console → OAuth consent screen passarla a **In produzione**.

## Cloudflare (Worker di login)
Il Worker si chiama `todo-auth`, quindi l'indirizzo da incollare in Settings → Sign-in server ha la forma `https://todo-auth.<tuo-account>.workers.dev` (`npx wrangler deploy` dalla cartella `worker/` stampa quello esatto). Codice e configurazione in `worker/`.
