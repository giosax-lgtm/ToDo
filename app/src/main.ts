// PUNTO D'INGRESSO dell'applicazione (caricato da index.html con <script type="module">).
// Importa il foglio di stile globale (app.css) e monta il componente radice App.svelte nel <div id="app"> di index.html.
// Non contiene logica: tutto parte da App.svelte, che inizializza lo store (lib/store.svelte.ts) e i servizi Google.

import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
