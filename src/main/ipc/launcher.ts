import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { wrap } from './wrap'
import { installCommand, launchPaths, resolveLaunchPath } from '../launcher'
import type { LaunchCommand, LaunchRequest } from '../../shared/launcher'

// Repositories asked for from outside the app (`sillygit ~/code/api`, or a
// folder dropped on the Dock icon) wait here until the renderer, once it has
// restored the last session, takes them and opens each as a tab.

const pending: LaunchRequest[] = []

async function queue(paths: string[], getWindow: () => BrowserWindow | null): Promise<void> {
  if (paths.length === 0) return
  for (const path of paths) pending.push(await resolveLaunchPath(path))
  getWindow()?.webContents.send('launcher:requested')
}

/** Queues the folders this process was started with. */
export function queueStartupPaths(getWindow: () => BrowserWindow | null): void {
  void queue(launchPaths(process.argv, process.cwd(), !!process.defaultApp), getWindow)
}

function bringForward(getWindow: () => BrowserWindow | null, createWindow: () => void): void {
  // Before ready, the window is still to come and opens on its own.
  if (!app.isReady()) return
  // On macOS the app outlives its window; a new one restores the session, then takes the queue.
  if (!getWindow()) createWindow()
  const window = getWindow()
  if (window?.isMinimized()) window.restore()
  window?.show()
  window?.focus()
}

/** Queues a later `sillygit <folder>`, and brings the window forward for it. */
export function queueSecondInstance(
  argv: string[],
  cwd: string,
  getWindow: () => BrowserWindow | null,
  createWindow: () => void
): void {
  bringForward(getWindow, createWindow)
  // A second instance runs the same way this one did, so its argv has the same shape.
  void queue(launchPaths(argv, cwd, !!process.defaultApp), getWindow)
}

/** Queues a folder macOS asked us to open (dropped on the Dock icon, `open -a SillyGit <folder>`). */
export function queueOpenFile(path: string, getWindow: () => BrowserWindow | null, createWindow: () => void): void {
  bringForward(getWindow, createWindow)
  void queue([path], getWindow)
}

/** How a script starts this SillyGit: the app itself, or Electron and the checkout it runs. */
function launchCommand(): LaunchCommand {
  // An AppImage runs from a fresh mount each time; APPIMAGE is the file itself.
  if (process.platform === 'linux' && process.env['APPIMAGE']) return { program: process.env['APPIMAGE'], args: [] }
  return { program: process.execPath, args: process.defaultApp ? [app.getAppPath()] : [] }
}

export function registerLauncherHandlers(): void {
  ipcMain.handle('launcher:take', () => pending.splice(0))

  ipcMain.handle('launcher:install-command', () =>
    wrap(() =>
      installCommand({
        platform: process.platform,
        command: launchCommand(),
        binDir: join(app.getPath('userData'), 'bin')
      })
    )
  )
}
