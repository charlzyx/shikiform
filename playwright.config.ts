import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 8_000 },
  use: { baseURL: 'http://localhost:4321' },
  webServer: {
    // astro preview 只监听 IPv6 localhost；host 参数由 npm script 透传。
    command: 'npm run preview -- --host localhost --port 4321',
    url: 'http://localhost:4321/play/query',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
