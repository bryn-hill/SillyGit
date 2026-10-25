import { defineConfig } from '@playwright/test'

// End-to-end tests drive the built Electron app (out/), so run
// `npm run build` first — `npm run test:e2e` does both.
export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Each test launches its own Electron instance; keep it to one at a time
  // so they don't fight over CPU on small CI machines.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list'
})
