import { app, ipcMain } from 'electron'
import * as selfUpdate from '../selfUpdate'
import { getMainWindow, isE2E } from '../window'
import { NO_SELF_UPDATE, type SelfUpdateStatus, type SelfUpdateStep } from '../../shared/selfUpdate'
import { wrap } from './wrap'

// SillyGit updating itself from the git checkout it runs from (see selfUpdate.ts).
const UPDATE_CHECK_MS = 30 * 60 * 1000
let updateCheckout: Promise<string | null> | null = null
let updateStatus: SelfUpdateStatus = NO_SELF_UPDATE
let updateStep: SelfUpdateStep | null = null

/** The checkout SillyGit runs from; null for a packaged build. E2E tests point it at a scratch clone. */
function selfUpdateCheckout(): Promise<string | null> {
  updateCheckout ??= selfUpdate.resolveCheckout({
    isPackaged: app.isPackaged,
    isE2E,
    override: process.env['SILLYGIT_UPDATE_CHECKOUT'],
    appPath: app.getAppPath()
  })
  return updateCheckout
}

function sendUpdateState(): void {
  getMainWindow()?.webContents.send('self-update:changed', updateStatus, updateStep)
}

async function refreshUpdateStatus(fetch: boolean): Promise<SelfUpdateStatus> {
  const root = await selfUpdateCheckout()
  if (!root) return updateStatus
  try {
    const next = await selfUpdate.checkForUpdate(root, fetch)
    // Without a fetch, the last fetch's time and failure still stand.
    updateStatus = fetch ? next : { ...next, checkedAt: updateStatus.checkedAt, error: next.error ?? updateStatus.error }
  } catch (err) {
    updateStatus = { ...updateStatus, supported: true, root, error: err instanceof Error ? err.message : String(err) }
  }
  sendUpdateState()
  return updateStatus
}

/** Starts the updated SillyGit and quits this one. */
function relaunch(): void {
  // A dev-server run would come back pointing at a dev server that quits
  // along with this process, so load the build the update just made instead.
  Reflect.deleteProperty(process.env, 'ELECTRON_RENDERER_URL')
  const appPath = app.getAppPath()
  // electron-vite starts Electron with the relative entry "."; make it absolute.
  const args = process.argv.slice(1).map((arg) => (arg === '.' ? appPath : arg))
  app.relaunch({ args })
  // Let the new instance take the single-instance lock rather than hand its launch to this one.
  app.releaseSingleInstanceLock()
  app.quit()
}

/** Checks for an update a few seconds after launch and every half hour after. */
export function startUpdateChecks(): void {
  setTimeout(() => void refreshUpdateStatus(true), 5000)
  setInterval(() => {
    if (!updateStep) void refreshUpdateStatus(true)
  }, UPDATE_CHECK_MS)
}

/** The Update SillyGit button: status, check now, and pull + rebuild + relaunch. */
export function registerSelfUpdateHandlers(): void {
  ipcMain.handle('self-update:status', async () => {
    if (!updateStatus.supported) await refreshUpdateStatus(false)
    return { status: updateStatus, step: updateStep }
  })

  ipcMain.handle('self-update:check', () => wrap(() => refreshUpdateStatus(true)))

  ipcMain.handle('self-update:apply', () =>
    wrap(async () => {
      const root = await selfUpdateCheckout()
      if (!root) throw new Error("SillyGit isn't running from a git checkout, so it can't update itself.")
      if (updateStep) throw new Error('SillyGit is already updating.')
      try {
        const result = await selfUpdate.applyUpdate(root, {
          onStep: (step) => {
            updateStep = step
            sendUpdateState()
          },
          npm: selfUpdate.runNpm
        })
        if (result.updated) {
          updateStep = 'restarting'
          sendUpdateState()
          // Let the window show "Restarting…" (and any stash notice) first.
          setTimeout(relaunch, result.stashedChanges ? 4000 : 800)
        }
        return result
      } finally {
        if (updateStep !== 'restarting') updateStep = null
        void refreshUpdateStatus(false)
      }
    })
  )
}
