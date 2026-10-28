import { defineConfig } from '@playwright/test'

// End-to-end tests drive the built Electron app (out/), so run
// `npm run build` first — `npm run test:e2e` does both.
export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Each worker runs its own Electron app (shared by its tests, see
  // fixtures.ts), so tests run in parallel, even within a file. Electron is
  // CPU-hungry: one worker per core on CI machines, which do nothing else,
  // and half the cores on a developer's machine.
  fullyParallel: true,
  workers: process.env['CI'] ? '100%' : '50%',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list'
})
