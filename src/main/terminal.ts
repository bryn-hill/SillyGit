import { ipcMain, type BrowserWindow, type WebContents } from 'electron'
import os from 'os'
import * as pty from 'node-pty'
import { delimiter } from 'path'
import { searchPath } from './executables'

const sessions = new Map<number, pty.IPty>()
let nextId = 1
const pagesHooked = new WeakSet<WebContents>()

// A reload leaves the shells it started with no view and nothing to stop
// them (a Run's server, say), so they end with the page.
function endWithPage(contents: WebContents): void {
  if (pagesHooked.has(contents)) return
  pagesHooked.add(contents)
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) killAllTerminals()
  })
}

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe'
  return process.env.SHELL || '/bin/zsh'
}

/** The shell and arguments that run `command` and exit, loading the user's profile so PATH (nvm, Homebrew) matches their own terminal. */
function commandShell(command: string): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: process.env.COMSPEC || 'cmd.exe', args: ['/d', '/s', '/c', command] }
  return { file: defaultShell(), args: ['-i', '-l', '-c', command] }
}

/**
 * The shell for a terminal tab. On macOS and Linux it's a login shell, as
 * Terminal.app and VS Code start it, so the user's profile (.zprofile,
 * .bash_profile, Homebrew's shellenv) sets PATH up as well as their rc file.
 */
function interactiveShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: defaultShell(), args: [] }
  return { file: defaultShell(), args: ['-l'] }
}

/**
 * The environment shells start with. Opened from the Dock or Finder, SillyGit
 * gets launchd's bare PATH, so the usual install folders (Homebrew,
 * ~/.local/bin where `claude` lives) are added in case the profile doesn't.
 */
function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value
  // Windows spells it Path; its terminals already get the full user PATH.
  if (process.platform !== 'win32') env.PATH = searchPath(process.env.PATH).join(delimiter)
  env.TERM_PROGRAM = 'SillyGit'
  env.COLORTERM = 'truecolor'
  return env
}

export function registerTerminalHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    'terminal:create',
    (e, cwd: string | undefined, cols: number, rows: number, command?: string): number => {
      endWithPage(e.sender)
      const id = nextId++
      const { file, args } = command ? commandShell(command) : interactiveShell()
      const ptyProcess = pty.spawn(file, args, {
        name: 'xterm-256color',
        cols: cols > 0 ? cols : 80,
        rows: rows > 0 ? rows : 24,
        cwd: cwd || os.homedir(),
        env: shellEnv()
      })
      sessions.set(id, ptyProcess)

      ptyProcess.onData((data) => {
        getWindow()?.webContents.send('terminal:data', id, data)
      })
      ptyProcess.onExit(({ exitCode }) => {
        sessions.delete(id)
        getWindow()?.webContents.send('terminal:exit', id, exitCode)
      })

      return id
    }
  )

  ipcMain.on('terminal:write', (_e, id: number, data: string) => {
    sessions.get(id)?.write(data)
  })

  ipcMain.on('terminal:resize', (_e, id: number, cols: number, rows: number) => {
    if (cols <= 0 || rows <= 0) return
    try {
      sessions.get(id)?.resize(cols, rows)
    } catch {
      // the pty may have already exited; ignore
    }
  })

  ipcMain.on('terminal:kill', (_e, id: number) => {
    sessions.get(id)?.kill()
    sessions.delete(id)
  })
}

export function killAllTerminals(): void {
  for (const ptyProcess of sessions.values()) ptyProcess.kill()
  sessions.clear()
}
