import { spawn } from 'child_process'
import { promises as fsp } from 'fs'
import { homedir } from 'os'
import { delimiter, isAbsolute, join, relative, resolve } from 'path'
import {
  EDITOR_PRESETS,
  customEditorArgs,
  editorArgs,
  editorPreset,
  type EditorId,
  type EditorPreset,
  type InstalledEditor
} from '../shared/editors'
import { getEditorSettings } from './settings'
import { findExecutable, isExecutable, searchPath } from './executables'

// "Open in <editor>": finds the code editors and IDEs installed here, and
// opens a repository, or a file in it, in one of them.

/** How to start an editor: its own command line tool, or (macOS) `open -a` on its app bundle. */
type Launcher = { kind: 'cli'; path: string } | { kind: 'app'; path: string }

// JetBrains Toolbox puts its IDEs in ~/Applications (older versions in a subfolder).
// The e2e tests point SILLYGIT_APP_FOLDERS elsewhere, so they never start a real editor.
function appFolders(): string[] {
  const override = process.env.SILLYGIT_APP_FOLDERS
  if (override !== undefined) return override.split(delimiter).filter(Boolean)
  return ['/Applications', join(homedir(), 'Applications'), join(homedir(), 'Applications', 'JetBrains Toolbox')]
}

async function exists(path: string): Promise<boolean> {
  return fsp
    .stat(path)
    .then(() => true)
    .catch(() => false)
}

async function findLauncher(preset: EditorPreset): Promise<Launcher | null> {
  if (process.platform === 'darwin') {
    for (const folder of appFolders()) {
      for (const app of preset.macApps ?? []) {
        const bundle = join(folder, app)
        if (!(await exists(bundle))) continue
        const cli = preset.macCli && join(bundle, preset.macCli)
        if (cli && (await isExecutable(cli))) return { kind: 'cli', path: cli }
        return { kind: 'app', path: bundle }
      }
    }
  }
  for (const command of preset.commands ?? []) {
    const path = await findExecutable(command)
    if (path) return { kind: 'cli', path }
  }
  return null
}

let found: Promise<Map<EditorId, Launcher>> | null = null

function findAll(): Promise<Map<EditorId, Launcher>> {
  found ??= Promise.all(EDITOR_PRESETS.map(async (p) => [p.id, await findLauncher(p)] as const)).then(
    (pairs) => new Map(pairs.filter((pair): pair is [EditorId, Launcher] => pair[1] !== null))
  )
  return found
}

/** The editors installed here, in the presets' order. `rescan` looks again (after installing one, say). */
export async function listEditors(rescan = false): Promise<InstalledEditor[]> {
  if (rescan) found = null
  const launchers = await findAll()
  return EDITOR_PRESETS.filter((p) => launchers.has(p.id)).map(({ id, name, short }) => ({ id, name, short }))
}

function quoteForCmd(arg: string): string {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg
}

/** Starts `program` on its own, so it outlives SillyGit; resolves once it has started. */
function launch(program: string, args: string[], cwd: string): Promise<void> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: searchPath().join(delimiter)
  }
  // Editors built on Electron (VS Code and friends) would start as plain Node.
  delete env.ELECTRON_RUN_AS_NODE
  // Node only runs .cmd/.bat files (code.cmd on Windows) through a shell.
  const viaShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(program)
  return new Promise((resolvePromise, reject) => {
    const child = viaShell
      ? spawn([program, ...args].map(quoteForCmd).join(' '), {
          cwd,
          env,
          shell: true,
          detached: true,
          stdio: 'ignore'
        })
      : spawn(program, args, { cwd, env, detached: true, stdio: 'ignore' })
    child.once('error', (err) => reject(new Error(`Couldn't start the editor: ${err.message}`)))
    child.once('spawn', () => {
      child.unref()
      resolvePromise()
    })
  })
}

/** `file` (relative to the repo) as an absolute path, refusing anything outside the repo. */
function fileInRepo(repoPath: string, file: string): string {
  const absolute = resolve(repoPath, file)
  const rel = relative(repoPath, absolute)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${file} is not inside the repository.`)
  return absolute
}

/** Opens the repository, or `file` in it, in `editor`. */
export async function openInEditor(repoPath: string, editor: EditorId, file?: string): Promise<void> {
  const target = file ? fileInRepo(repoPath, file) : undefined
  if (editor === 'custom') {
    const { customCommand } = await getEditorSettings()
    const { program, args } = customEditorArgs(customCommand, repoPath, target)
    const path = await findExecutable(program)
    if (!path) throw new Error(`The editor command was not found (${program}).`)
    return launch(path, args, repoPath)
  }
  const preset = editorPreset(editor)
  if (!preset) throw new Error(`Unknown editor: ${editor}`)
  const launcher = (await findAll()).get(editor) ?? (await findLauncher(preset))
  if (!launcher) throw new Error(`${preset.name} isn't installed, or SillyGit can't find it.`)
  if (launcher.kind === 'app') return launch('open', ['-a', launcher.path, target ?? repoPath], repoPath)
  return launch(launcher.path, editorArgs(preset, repoPath, target), repoPath)
}
