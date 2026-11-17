import { app, ipcMain } from 'electron'
import { AppUpdateController, installFacts, latestReleaseVersion } from '../appUpdate'
import { getMainWindow, isE2E } from '../window'
import { NO_APP_UPDATE, manualUpdateReason } from '../../shared/appUpdate'
import { wrap } from './wrap'

// Updates for installed builds from GitHub Releases. Source checkouts use
// ipc/selfUpdate.ts instead, so only packaged builds outside e2e get this.
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
const FIRST_CHECK_MS = 10_000

let controller: AppUpdateController | null = null

function getController(): AppUpdateController | null {
  if (!app.isPackaged || isE2E) return null
  controller ??= new AppUpdateController({
    currentVersion: app.getVersion(),
    manualReason: manualUpdateReason(installFacts(process.execPath)),
    loadUpdater: async () => (await import('electron-updater')).autoUpdater,
    latestReleaseVersion,
    onChange: (status) => getMainWindow()?.webContents.send('app-update:changed', status)
  })
  return controller
}

/** Checks for a new release shortly after launch and every few hours after. */
export function startAppUpdateChecks(): void {
  const c = getController()
  if (!c) return
  setTimeout(() => void c.check(), FIRST_CHECK_MS)
  setInterval(() => void c.check(), CHECK_EVERY_MS)
}

export function registerAppUpdateHandlers(): void {
  ipcMain.handle('app-update:status', () => getController()?.current ?? NO_APP_UPDATE)
  ipcMain.handle('app-update:check', () =>
    wrap(async () => (await getController()?.check()) ?? NO_APP_UPDATE)
  )
  ipcMain.handle('app-update:download', () =>
    wrap(async () => {
      const c = getController()
      if (!c) throw new Error("This build of SillyGit doesn't update from releases.")
      return c.download()
    })
  )
  ipcMain.handle('app-update:install', () =>
    wrap(async () => {
      const c = getController()
      if (!c) throw new Error("This build of SillyGit doesn't update from releases.")
      if (c.current.phase !== 'ready') throw new Error("The update hasn't finished downloading.")
      // quitAndInstall closes every window; let the reply reach the renderer first.
      setTimeout(() => void c.install(), 300)
    })
  )
}
