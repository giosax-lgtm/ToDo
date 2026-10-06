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
