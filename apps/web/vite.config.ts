import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' + <PwaUpdateBanner>: a deploy is announced and applied on a
      // click. 'autoUpdate' silently left already-open tabs running the old
      // bundle until the user reloaded, which made production behave
      // differently from the dev server (which has no service worker).
      registerType: 'prompt',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Calculator Suite',
        short_name: 'Calculator',
        description: 'A responsive web calculator suite with basic, scientific, financial, and scanner modes',
        theme_color: '#0ea5e9',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icons/calculator.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // The Tesseract runtime (4 wasm.js files, ~17 MB) must NOT be
        // precached: a 17 MB install makes the first SW update slow/flaky on
        // mobile, and a truncated download would be pinned until the next
        // deploy. It is fetched on first use and then served from the
        // runtime cache below, so offline scans keep working after one scan.
        globIgnores: ['**/tesseract/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        runtimeCaching: [
          {
            urlPattern: /\/tesseract\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-assets',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@math-core': path.resolve(__dirname, '../../packages/math-core/src'),
    },
  },
  server: {
    port: 5173,
    open: true,
    // Dev-only allowlist for remote preview hosts (e.g. cloud dev-server
    // sandboxes). No hostname is baked into this file: set
    // VITE_ALLOWED_HOSTS="a.example.com,b.example.com" when starting Vite.
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
      : undefined,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
