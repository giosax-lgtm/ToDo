// CONFIGURAZIONE DI VITE (build e dev server). Non fa parte del codice dell'app a runtime.
//  - plugin svelte: compila i componenti .svelte;
//  - plugin VitePWA: genera manifest e service worker (l'app si installa come PWA e funziona offline);
//  - base './': percorsi relativi, cosi' il sito funziona sia su localhost sia in una sottocartella (es. GitHub Pages).
// Usato da: npm run dev / build / serve (vedi package.json) e dal workflow .github/workflows/deploy.yml.

import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'toDo',
        short_name: 'toDo',
        description: 'Private kanban to-do list',
        theme_color: '#3f0e40',
        background_color: '#3f0e40',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        // never cache Google API calls
        navigateFallbackDenylist: [/^\/oauth/],
      },
    }),
  ],
})
