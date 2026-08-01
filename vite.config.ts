import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Déploiement possible à la racine d'un domaine (Netlify, Vercel) ou dans un
// sous-chemin (GitHub Pages : /Sportsderue/). Le workflow renseigne BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sports de rue — équipements sportifs libres',
        short_name: 'Sports de rue',
        description:
          'Trouvez les équipements sportifs en accès libre et gratuit autour de vous : city-stades, terrains de basket, tables de ping-pong, skateparks…',
        lang: 'fr',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f7f5',
        theme_color: '#0f7b5f',
        categories: ['sports', 'navigation', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        // Map tiles are big; keep the SW precache reasonable and cache them at runtime.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Fonds de carte, glyphes et sprites IGN (Géoplateforme) : immuables.
            urlPattern: /^https:\/\/data\.geopf\.fr\/(tms|annexes|wmts).*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ign-basemap',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Géocodage (recherche de villes) : réponses courtes, très réutilisables.
            urlPattern: /^https:\/\/data\.geopf\.fr\/geocodage\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'geocoding',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Données Data ES : on privilégie le réseau, avec repli hors-ligne.
            urlPattern: /^https:\/\/equipements\.sports\.gouv\.fr\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'data-es',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: {
    // Le worker MapLibre est un module ES qui importe son propre code partagé.
    format: 'es',
  },
  optimizeDeps: {
    // MapLibre charge son worker via `new URL(..., import.meta.url)` : le pré-bundling
    // de Vite casse cette résolution en développement.
    exclude: ['maplibre-gl'],
  },
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        // MapLibre pèse l'essentiel du bundle et ne change presque jamais :
        // on l'isole pour que les mises à jour de l'app n'invalident pas son cache.
        advancedChunks: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ }],
        },
      },
    },
  },
})
