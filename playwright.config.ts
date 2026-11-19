import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 8_000 },
  use: { baseURL: 'http://localhost:4321' },
  webServer: {
    // Astro otherwise backgrounds preview in agent sessions and Playwright loses its server process.
    command: 'npm run preview -- --ignore-lock --host localhost --port 4321',
    url: 'http://localhost:4321/play/query',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
