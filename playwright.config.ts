import { defineConfig } from '@playwright/test'
import { availableParallelism, totalmem } from 'node:os'

// Each worker runs its own Electron app, which with its git processes needs
// about 3.5 GB to stay responsive: one worker per core on the 10-core, 16 GB
// Mac runner left it swapping, with single git steps taking 7–10s and tests
// timing out. So use one worker per core on CI machines, which do nothing
// else, and half the cores on a developer's machine, but never more than the
// memory allows. E2E_WORKERS overrides it.
const cores = availableParallelism()
const byMemory = Math.max(1, Math.floor(totalmem() / 3.5e9))
const workers = Number(process.env['E2E_WORKERS']) || Math.min(process.env['CI'] ? cores : Math.ceil(cores / 2), byMemory)

// End-to-end tests drive the built Electron app (out/), so run
// `npm run build` first — `npm run test:e2e` does both.
export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Each worker's app is shared by its tests (see fixtures.ts), so tests run
  // in parallel, even within a file.
  fullyParallel: true,
  workers,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list'
})
