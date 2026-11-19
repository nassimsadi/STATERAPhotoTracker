import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' : l'appli fonctionne quel que soit l'emplacement d'hébergement.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-statera.png', 'apple-touch-icon.png', 'favicon.png', 'plan-de-route-modele.xlsx'],
      manifest: {
        name: 'STATERA Networks – Photos de site',
        short_name: 'STATERA Photos',
        description: 'Photos de site géolocalisées, plan de route et rapports de tournée.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F6F5',
        theme_color: '#2E5E58',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,xlsx}'], navigateFallback: 'index.html' },
    }),
  ],
});
