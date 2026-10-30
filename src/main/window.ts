import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { windowBackground } from '../shared/theme'
import icon from '../../resources/icon.png?asset'

// When set, the window is never shown (still fully rendered, just not mapped
// to the screen) so a Playwright driver can automate it without disturbing
// the user's desktop. See .claude/skills/run-sillygit.
export const isE2E = process.env['SILLYGIT_E2E'] === '1'

const CONSOLE_LEVELS: Record<string, string> = { info: 'INFO', warning: 'WARN', error: 'ERROR', debug: 'DEBUG' }

// How long after first paint to show the window if the renderer hasn't said it's ready.
const READY_FALLBACK_MS = 3000

let mainWindow: BrowserWindow | null = null

/** The app's window, or null while there is none (closed on macOS, say). */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: windowBackground(nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = window

  // Shown once the renderer says it has restored the last session (and
  // loaded the repo it reopens), so launch never flashes the empty "no repo"
  // screen first. A renderer that never says so is shown anyway, a little later.
  let shown = false
  const show = (): void => {
    if (shown || isE2E || window.isDestroyed()) return
    shown = true
    window.show()
  }
  window.webContents.ipc.on('window:ready', show)
  window.on('ready-to-show', () => setTimeout(show, READY_FALLBACK_MS))

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  window.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
    const file = sourceId ? sourceId.split('/').pop() : ''
    console.log(`[renderer:${CONSOLE_LEVELS[level] ?? level}] ${message} (${file}:${lineNumber})`)
  })

  window.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] process gone:', details.reason)
  })

  window.webContents.on('unresponsive', () => {
    console.error('[renderer] unresponsive')
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
