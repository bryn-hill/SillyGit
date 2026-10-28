import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

// When set, the window is never shown (still fully rendered, just not mapped
// to the screen) so a Playwright driver can automate it without disturbing
// the user's desktop. See .claude/skills/run-sillygit.
export const isE2E = process.env['SILLYGIT_E2E'] === '1'

const CONSOLE_LEVELS: Record<string, string> = { info: 'INFO', warning: 'WARN', error: 'ERROR', debug: 'DEBUG' }

let mainWindow: BrowserWindow | null = null

/** The app's window, or null while there is none (closed on macOS, say). */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = window

  window.on('ready-to-show', () => {
    if (!isE2E) window.show()
  })

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
