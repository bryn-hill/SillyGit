import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { delimiter, dirname, isAbsolute, join, resolve } from 'path'
import { runGit } from './gitExec'
import {
  posixScript,
  windowsScript,
  type CommandInstallResult,
  type LaunchCommand,
  type LaunchRequest
} from '../shared/launcher'

// The `sillygit` command line launcher: working out which repository a launch
// asks for, and installing the command onto the PATH.

/**
 * The folders a launch's arguments name, made absolute against `cwd`.
 * `argv` is the whole of process.argv (or a second instance's): the
 * executable comes first and, when Electron runs an app folder
 * (`electron .`, so `defaultApp`), that folder next. Flags, including
 * the ones Chromium adds itself, are skipped.
 */
export function launchPaths(argv: string[], cwd: string, defaultApp: boolean): string[] {
  const args = argv.slice(1).filter((arg) => arg !== '' && !arg.startsWith('-'))
  return (defaultApp ? args.slice(1) : args).map((arg) => (isAbsolute(arg) ? arg : resolve(cwd, arg)))
}

/**
 * What to open for a launch path: the top of the repository it's in, so
 * `sillygit src` opens the whole repo. A folder outside any repository is
 * passed on as it is, for the app to offer to initialise. The top is found by
 * walking up from the path as given rather than taken from --show-toplevel,
 * which resolves symlinks (/var to /private/var on macOS) and so wouldn't
 * match a tab already open on the same repo.
 */
export async function resolveLaunchPath(path: string): Promise<LaunchRequest> {
  let folder = path
  try {
    if (!(await fs.stat(path)).isDirectory()) folder = dirname(path)
  } catch {
    return { path, error: `Couldn't open ${path}: there's no such file or folder.` }
  }
  try {
    const up = (await runGit(folder, ['rev-parse', '--show-cdup'])).trim()
    return { path: resolve(folder, up) }
  } catch {
    return { path: folder }
  }
}

export interface InstallTarget {
  platform: NodeJS.Platform
  /** Starts this SillyGit; see launchCommand in ipc/launcher.ts. */
  command: LaunchCommand
  /** A folder of SillyGit's own to keep the script in. */
  binDir: string
  home?: string
  /** Runs a shell command as an administrator (macOS asks for a password). */
  runAsAdmin?: (shellCommand: string) => Promise<void>
  /** Adds a folder to the user's PATH (Windows). */
  addToUserPath?: (dir: string) => Promise<void>
  /** The PATH to check the install against. */
  pathEnv?: string
}

/**
 * Writes the `sillygit` script and puts it on the PATH: a link in
 * /usr/local/bin on macOS (asking for an administrator password when that
 * folder isn't writable), in ~/.local/bin on Linux, and SillyGit's own bin
 * folder added to the user's PATH on Windows. Running it again refreshes the
 * script, say after SillyGit has moved.
 */
export async function installCommand(target: InstallTarget): Promise<CommandInstallResult> {
  const { platform, command, binDir } = target
  await fs.mkdir(binDir, { recursive: true })

  if (platform === 'win32') {
    const script = join(binDir, 'sillygit.cmd')
    await fs.writeFile(script, windowsScript(command))
    await (target.addToUserPath ?? addToWindowsUserPath)(binDir)
    return { installedAt: script, note: 'Open a new terminal to use it.' }
  }

  const script = join(binDir, 'sillygit')
  await fs.writeFile(script, posixScript(command), { mode: 0o755 })
  await fs.chmod(script, 0o755)

  if (platform === 'darwin') {
    const link = '/usr/local/bin/sillygit'
    await refuseForeignFile(link)
    if (await linksTo(link, script)) return { installedAt: link }
    try {
      await fs.mkdir(dirname(link), { recursive: true })
      await linkTo(script, link)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EACCES' && code !== 'EPERM') throw err
      await (target.runAsAdmin ?? runAsMacAdmin)(
        `mkdir -p /usr/local/bin && ln -sf ${shellQuote(script)} ${shellQuote(link)}`
      )
    }
    return { installedAt: link }
  }

  const binOnPath = join(target.home ?? homedir(), '.local', 'bin')
  const link = join(binOnPath, 'sillygit')
  await refuseForeignFile(link)
  await fs.mkdir(binOnPath, { recursive: true })
  await linkTo(script, link)
  const onPath = (target.pathEnv ?? process.env['PATH'] ?? '').split(delimiter).includes(binOnPath)
  return { installedAt: link, note: onPath ? undefined : `Add ${binOnPath} to your PATH to use it.` }
}

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

/** Replaces `link` with a symlink to `script`. */
async function linkTo(script: string, link: string): Promise<void> {
  await fs.rm(link, { force: true })
  await fs.symlink(script, link)
}

async function linksTo(link: string, script: string): Promise<boolean> {
  try {
    return (await fs.readlink(link)) === script
  } catch {
    return false
  }
}

/** Stops the install from overwriting a `sillygit` that some other program put there. */
async function refuseForeignFile(link: string): Promise<void> {
  let stat
  try {
    stat = await fs.lstat(link)
  } catch {
    return
  }
  // An earlier install's link, perhaps from a SillyGit kept somewhere else.
  if (stat.isSymbolicLink() && /sillygit/i.test(await fs.readlink(link))) return
  throw new Error(`${link} already exists and isn't SillyGit's. Move it out of the way and try again.`)
}

function run(program: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((done, fail) => {
    execFile(program, args, { env: env ?? process.env }, (err, _stdout, stderr) => {
      if (!err) done()
      else fail(new Error(stderr.trim() || err.message))
    })
  })
}

async function runAsMacAdmin(shellCommand: string): Promise<void> {
  const quoted = shellCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  try {
    await run('osascript', ['-e', `do shell script "${quoted}" with administrator privileges`])
  } catch (err) {
    if (String(err).includes('-128')) throw new Error('Installing the sillygit command was cancelled.')
    throw err
  }
}

/** Adds `dir` to the user's PATH, which also tells Explorer and new terminals about it. */
function addToWindowsUserPath(dir: string): Promise<void> {
  const script = [
    "$path = [Environment]::GetEnvironmentVariable('Path', 'User')",
    "$parts = if ($path) { $path -split ';' } else { @() }",
    'if ($parts -notcontains $env:SILLYGIT_BIN) {',
    "  [Environment]::SetEnvironmentVariable('Path', (($parts + $env:SILLYGIT_BIN) -join ';'), 'User')",
    '}'
  ].join('\n')
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    ...process.env,
    SILLYGIT_BIN: dir
  })
}
