import { defineConfig } from '@playwright/test'

const basePath = '/line-dog-city/'
const origin = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: `${origin}${basePath}`,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `VITE_BASE=${basePath} npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort --base ${basePath}`,
    url: `${origin}${basePath}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
