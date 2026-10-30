import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { windowBackground } from '../shared/theme'
import icon from '../../resources/icon.png?asset'

// When set, the app runs for a Playwright driver without disturbing the
// user's desktop: its window never takes focus and, unless
// SILLYGIT_E2E_SHOW_WINDOW=1, can't be seen. See .claude/skills/run-sillygit.
export const isE2E = process.env['SILLYGIT_E2E'] === '1'
const showE2EWindow = process.env['SILLYGIT_E2E_SHOW_WINDOW'] === '1'

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
      nodeIntegration: false,
      // A test window sits behind the user's other windows; keep it rendering at full speed there.
      backgroundThrottling: !isE2E
    }
  })
  mainWindow = window
  if (isE2E) showForE2E(window)

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

/**
 * A never-shown window barely renders (each Playwright click waits ~2s for a
 * stable frame, and screenshots hang), so a test window is shown, without
 * focus. Where windows can be made transparent (macOS, Windows) it's shown
 * fully transparent and lets clicks through, so it's invisible to the user;
 * Playwright's input goes straight to the page, so tests still work. Linux
 * can't, so there it stays hidden unless asked for (tests on xvfb ask).
 */
function showForE2E(window: BrowserWindow): void {
  if (showE2EWindow) {
    window.showInactive()
  } else if (process.platform === 'darwin' || process.platform === 'win32') {
    window.setOpacity(0)
    window.setIgnoreMouseEvents(true)
    window.setHasShadow(false)
    window.showInactive()
  }
}
