import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, isPreview }) => {
  const base = command === 'build' || isPreview ? '/palabra-pwa/' : '/'

  return {
    base,
    build: {rollupOptions:{output:{manualChunks(id){
      if(id.endsWith('/english-wordbooks.json'))return 'english-wordbooks'
    }}}},
    plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'icon-maskable.svg', 'licenses/ECDICT.txt', 'licenses/Spanish-Wiktionary.txt'],
      manifest: {
        name: 'palabra · 西语与英语背词',
        short_name: 'palabra',
        description: '每天一点，记住真正会用的西班牙语和英语。',
        lang: 'zh-CN',
        start_url: `${base}today`,
        scope: base,
        display: 'standalone',
        background_color: '#F5F6F2',
        theme_color: '#F5F6F2',
        icons: [
          { src: `${base}icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: `${base}icon-maskable.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [{
          urlPattern: /^https:\/\/picflow\.koolearn\.com\/dict\/mp3\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'palabra-audio-en-v1',
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 3464, maxAgeSeconds: 60 * 60 * 24 * 365 },
          },
        }],
      },
    }),
  ],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
    },
  }
})
