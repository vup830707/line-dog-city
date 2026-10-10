import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { publicBase } from './scripts/public-base.mjs'

const base = publicBase()

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/*.png', 'assets/*.jpg'],
      manifest: {
        name: '動物夜市',
        short_name: '動物夜市',
        description: '在奇幻夜市經營攤位的單人小遊戲',
        lang: 'zh-Hant',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fffaf3',
        theme_color: '#24170f',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,json,webmanifest}'],
        globIgnores: ['**/art25/contact-sheet.png'],
        navigateFallback: `${base}index.html`,
        modifyURLPrefix: { '': base },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
