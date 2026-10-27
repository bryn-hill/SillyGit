import { test as base, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SillyGitApp } from './pages/SillyGitApp'
import { FixtureRepo } from './support/fixtureRepo'

const APP_DIR = resolve(__dirname, '..')

// The window is never shown by default, so the suite doesn't pop windows on a
// developer's desktop. A never-shown window barely renders frames, though:
// each click waits ~2s for the element to look stable, and screenshots hang.
// In CI (under xvfb) nobody sees it, so show it without focus there. Set
// E2E_SHOW_WINDOW=1 to do the same locally.
const SHOW_WINDOW = !!process.env['CI'] || process.env['E2E_SHOW_WINDOW'] === '1'

type Fixtures = {
  repo: FixtureRepo
  userData: string
  electronApp: ElectronApplication
  sillygit: SillyGitApp
  /** Quits the app and starts it again with the same settings, like a real relaunch. */
  relaunch: () => Promise<SillyGitApp>
}

function launchApp(userData: string): Promise<ElectronApplication> {
  // SILLYGIT_E2E keeps the window hidden (see src/main/index.ts). Some
  // shells set ELECTRON_RUN_AS_NODE globally, which would start Electron as
  // plain Node; the CLAUDE* vars would make the Claude panel reuse the
  // parent Claude Code session.
  const env: Record<string, string> = { ...(process.env as Record<string, string>), SILLYGIT_E2E: '1' }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'CLAUDECODE', 'CLAUDE_CODE_SESSION_ID']) delete env[key]
  return electron.launch({ args: [APP_DIR, `--user-data-dir=${userData}`], env, timeout: 30_000 })
}

async function openWindow(electronApp: ElectronApplication): Promise<SillyGitApp> {
  const page = await electronApp.firstWindow()
  if (SHOW_WINDOW) {
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive())
  }
  await page.waitForLoadState('domcontentloaded')
  return new SillyGitApp(electronApp, page)
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  repo: async ({}, use) => {
    const repo = new FixtureRepo()
    await use(repo)
    repo.remove()
  },

  // eslint-disable-next-line no-empty-pattern
  userData: async ({}, use) => {
    // Fresh settings for every test, so saved workspace repos, recent repos
    // or API keys from a developer's own install never leak in. The
    // settings file also stops the one-time copy from the old gitdesk
    // settings location.
    const userData = mkdtempSync(join(tmpdir(), 'sillygit-e2e-userdata-'))
    // Background fetches are off so nothing reaches the network or prunes a
    // test's fake remote branches.
    writeFileSync(join(userData, 'sillygit-settings.json'), JSON.stringify({ autoFetchMinutes: 0 }))
    await use(userData)
    rmSync(userData, { recursive: true, force: true })
  },

  electronApp: async ({ userData }, use, testInfo) => {
    const app = await launchApp(userData)

    // The config's `trace` option only covers the built-in browser page, so
    // record one here and keep it when a test fails.
    await app.context().tracing.start({ screenshots: SHOW_WINDOW, snapshots: true })
    await use(app)
    // A test that used `relaunch` has already closed this app, and its trace with it.
    if (testInfo.status !== testInfo.expectedStatus) {
      const tracePath = testInfo.outputPath('trace.zip')
      const saved = await app.context().tracing.stop({ path: tracePath }).then(() => true, () => false)
      if (saved) await testInfo.attach('trace', { path: tracePath, contentType: 'application/zip' })
    } else {
      await app.context().tracing.stop().catch(() => {})
    }

    await app.close().catch(() => {})
  },

  sillygit: async ({ electronApp }, use, testInfo) => {
    const sillygit = await openWindow(electronApp)
    await use(sillygit)
    if (SHOW_WINDOW && testInfo.status !== testInfo.expectedStatus) {
      const shot = await sillygit.page.screenshot({ timeout: 5_000 }).catch(() => null)
      if (shot) await testInfo.attach('screenshot', { body: shot, contentType: 'image/png' })
    }
  },

  relaunch: async ({ electronApp, userData }, use) => {
    const relaunched: ElectronApplication[] = []
    await use(async () => {
      await (relaunched.at(-1) ?? electronApp).close()
      const app = await launchApp(userData)
      relaunched.push(app)
      return openWindow(app)
    })
    for (const app of relaunched) await app.close().catch(() => {})
  }
})

export { expect } from '@playwright/test'
