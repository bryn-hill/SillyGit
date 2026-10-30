import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
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
  /** Extra environment for the app, e.g. `test.use({ appEnv: { … } })`. Implies `freshApp`. */
  appEnv: Record<string, string>
  /**
   * Launch an app just for this test instead of reusing the worker's, for a
   * test that changes main-process state resetApp can't put back.
   */
  freshApp: boolean
  repo: FixtureRepo
  userData: string
  electronApp: ElectronApplication
  sillygit: SillyGitApp
  /** Quits the app and starts it again with the same settings, like a real relaunch. */
  relaunch: () => Promise<SillyGitApp>
}

type WorkerFixtures = {
  /** The app this worker's tests share, launched on first use and replaced after a failure. */
  sharedApp: { app: ElectronApplication | null; url: string; dir: string }
}

function launchApp(userData: string, appEnv: Record<string, string> = {}): Promise<ElectronApplication> {
  // SILLYGIT_E2E keeps the window hidden (see src/main/index.ts). Some
  // shells set ELECTRON_RUN_AS_NODE globally, which would start Electron as
  // plain Node; the CLAUDE* vars would make the Claude panel reuse the
  // parent Claude Code session.
  const env: Record<string, string> = { ...(process.env as Record<string, string>), ...appEnv, SILLYGIT_E2E: '1' }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'CLAUDECODE', 'CLAUDE_CODE_SESSION_ID']) delete env[key]
  return electron.launch({ args: [APP_DIR, `--user-data-dir=${userData}`], env, timeout: 30_000 })
}

function makeUserData(): string {
  const userData = mkdtempSync(join(tmpdir(), 'sillygit-e2e-userdata-'))
  // Background fetches and avatar lookups are off so nothing reaches the
  // network or prunes a test's fake remote branches.
  writeFileSync(join(userData, 'sillygit-settings.json'), JSON.stringify({ autoFetchMinutes: 0, showAvatars: false }))
  return userData
}

async function openWindow(electronApp: ElectronApplication): Promise<SillyGitApp> {
  const page = await electronApp.firstWindow()
  if (SHOW_WINDOW) {
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive())
  }
  await page.waitForLoadState('domcontentloaded')
  return new SillyGitApp(electronApp, page)
}

/** Records the main process's pristine state, so `resetApp` can put back whatever a test stubbed. */
async function snapshotApp(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ ipcMain, clipboard, dialog, shell }) => {
    // ipcMain keeps `handle` handlers in this (internal) map; stubIpc and
    // friends replace entries in it, so copy the originals.
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, unknown> })._invokeHandlers
    ;(globalThis as Record<string, unknown>)['__e2ePristine'] = {
      handlers: new Map(handlers),
      clipboard: { ...clipboard },
      dialog: { ...dialog },
      shell: { ...shell },
      globals: new Set(Object.keys(globalThis))
    }
  })
}

type RendererApi = { api: { watchRepo(path: null): Promise<void>; removeWorkspaceRepo(path: string): Promise<unknown> } }

/**
 * Stops the app's page using the last test's repo and settings: leaving it
 * stops its timers (debounced layout saves) and ends its terminals, and the
 * repo is no longer watched, so nothing touches the repo while it's deleted.
 */
async function parkPage(page: Page): Promise<void> {
  page.removeAllListeners('dialog')
  if (page.url() === 'about:blank') return
  await page.evaluate(() => (globalThis as unknown as RendererApi).api.watchRepo(null)).catch(() => {})
  await page.goto('about:blank')
}

/**
 * Waits until the settings saves the page has sent so far have landed: saves
 * run one after another, and this no-op one is sent after them.
 */
async function flushSettings(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Saves are sent from effects, which run after the next paint.
    const { requestAnimationFrame } = globalThis as unknown as { requestAnimationFrame(callback: () => void): number }
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))
    await (globalThis as unknown as RendererApi).api.removeWorkspaceRepo('\0e2e-flush')
  })
}

/**
 * Makes a used app look freshly launched with `userData` as its settings
 * folder: no page state, no stubs, default window size. Much cheaper than
 * quitting and starting Electron again.
 */
async function resetApp(shared: WorkerFixtures['sharedApp'], userData: string): Promise<void> {
  const page = await shared.app!.firstWindow()
  await parkPage(page)
  await shared.app!.evaluate(
    async ({ app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, session, shell }, userData) => {
      const g = globalThis as Record<string, unknown>
      const pristine = g['__e2ePristine'] as {
        handlers: Map<string, unknown>
        clipboard: typeof clipboard
        dialog: typeof dialog
        shell: typeof shell
        globals: Set<string>
      }
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, unknown> })._invokeHandlers
      // Settings saves run one after another, so once this no-op save is done
      // every save the last test started has landed in its own folder.
      const flush = pristine.handlers.get('settings:remove-workspace-repo') as (e: unknown, path: string) => Promise<unknown>
      await flush({}, '\0e2e-flush')
      handlers.clear()
      for (const [channel, handler] of pristine.handlers) handlers.set(channel, handler)
      Object.assign(clipboard, pristine.clipboard)
      Object.assign(dialog, pristine.dialog)
      Object.assign(shell, pristine.shell)
      // Values tests parked on globalThis, e.g. recorded IPC calls.
      for (const key of Object.keys(g)) if (key !== '__e2ePristine' && !pristine.globals.has(key)) delete g[key]
      app.setPath('userData', userData)
      // What a launch with the fresh settings (no theme saved) applies.
      nativeTheme.themeSource = 'dark'
      await session.defaultSession.clearStorageData()
      const window = BrowserWindow.getAllWindows()[0]
      if (window.isMaximized()) window.unmaximize()
      window.setSize(1280, 800)
    },
    userData
  )
  await page.goto(shared.url)
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  appEnv: [{}, { option: true }],
  freshApp: [false, { option: true }],

  sharedApp: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      // Chromium's own profile stays here; each test's settings folder is
      // switched in by resetApp.
      const shared: WorkerFixtures['sharedApp'] = { app: null, url: '', dir: makeUserData() }
      await use(shared)
      await shared.app?.close().catch(() => {})
      rmSync(shared.dir, { recursive: true, force: true })
    },
    { scope: 'worker' }
  ],

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
    const userData = makeUserData()
    await use(userData)
    rmSync(userData, { recursive: true, force: true })
  },

  // Depends on `repo` so the app is parked (or closed) before the repo is deleted.
  electronApp: async ({ userData, appEnv, freshApp, sharedApp, repo: _repo }, use, testInfo) => {
    const shared = !freshApp && Object.keys(appEnv).length === 0
    let app: ElectronApplication
    if (!shared) {
      app = await launchApp(userData, appEnv)
    } else {
      if (!sharedApp.app) {
        const launched = await launchApp(sharedApp.dir)
        const page = await launched.firstWindow()
        await page.waitForLoadState('domcontentloaded')
        sharedApp.url = page.url()
        await snapshotApp(launched)
        sharedApp.app = launched
      }
      app = sharedApp.app
      await resetApp(sharedApp, userData)
    }

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

    // A failed test may have left the app in any state, so the next test
    // starts a new one rather than trust the reset.
    if (!shared || testInfo.status !== testInfo.expectedStatus) {
      if (shared) sharedApp.app = null
      await app.close().catch(() => {})
    } else if (sharedApp.app === app) {
      await parkPage(await app.firstWindow())
    }
  },

  sillygit: async ({ electronApp }, use, testInfo) => {
    const sillygit = await openWindow(electronApp)
    await use(sillygit)
    if (SHOW_WINDOW && testInfo.status !== testInfo.expectedStatus) {
      const shot = await sillygit.page.screenshot({ timeout: 5_000 }).catch(() => null)
      if (shot) await testInfo.attach('screenshot', { body: shot, contentType: 'image/png' })
    }
  },

  relaunch: async ({ electronApp, userData, appEnv, sharedApp }, use) => {
    const relaunched: ElectronApplication[] = []
    await use(async () => {
      const current = relaunched.at(-1) ?? electronApp
      await flushSettings(await current.firstWindow())
      // Quitting the worker's shared app means the next test launches a new one.
      if (sharedApp.app === electronApp) sharedApp.app = null
      await current.close()
      const app = await launchApp(userData, appEnv)
      relaunched.push(app)
      return openWindow(app)
    })
    for (const app of relaunched) await app.close().catch(() => {})
  }
})

export { expect } from '@playwright/test'
