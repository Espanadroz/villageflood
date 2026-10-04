import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'พอร์ทัลน้ำท่วมหมู่บ้าน', short_name: 'น้ำท่วมหมู่บ้าน', lang: 'th', start_url: '/', display: 'standalone',
        background_color: '#f5f7fa', theme_color: '#0b5cab',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      // Only the app shell is precached. API data is deliberately NOT cached by the service worker:
      // the app keeps its own timestamped snapshot so old data can never look current.
      // No runtime caching at all: Supabase REST/auth/storage and map tiles always go to the network.
      workbox: {
        navigateFallback: '/index.html',
        // Never answer API/asset requests with the HTML shell; only extension-less page navigations (/privacy, /map, ...).
        navigateFallbackDenylist: [/^\/assets\//, /^\/(rest|auth|storage|functions|realtime)\//, /\/[^/?]+\.[^/?]+$/],
        runtimeCaching: [],
        // The lazily loaded map chunk is ~1 MB; precache it so the map survives flaky networks.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
});
