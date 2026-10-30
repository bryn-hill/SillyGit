// Code editors and IDEs SillyGit can open a repository or file in: the ones it
// looks for, and how each is told to open a folder or a file in it. Pure, so
// the main process (which finds and launches them) and the renderer (which
// shows their names) share it.

import { splitCommand } from './mergeTools'

export type EditorId =
  | 'vscode'
  | 'vscode-insiders'
  | 'cursor'
  | 'windsurf'
  | 'zed'
  | 'sublime'
  | 'intellij'
  | 'webstorm'
  | 'pycharm'
  | 'goland'
  | 'phpstorm'
  | 'rubymine'
  | 'rider'
  | 'clion'
  | 'rustrover'
  | 'android-studio'
  | 'fleet'
  | 'xcode'
  | 'nova'
  | 'bbedit'
  | 'custom'

/**
 * How an editor opens a file inside the repo:
 * - 'goto': `code <repo> --goto <file>`, the repo's window with the file in it.
 * - 'both': `zed <repo> <file>`, the same with plain arguments.
 * - 'file': just the file (JetBrains IDEs find the project that holds it).
 */
type FileArgs = 'goto' | 'both' | 'file'

export interface EditorPreset {
  id: EditorId
  name: string
  /** A name short enough for the toolbar button. */
  short: string
  /** App bundles on macOS, looked for in /Applications and ~/Applications; the first found wins. */
  macApps?: string[]
  /** The command line tool inside the bundle, which can open a file in the repo's window. Without one, `open -a`. */
  macCli?: string
  /** Commands looked up on PATH (all platforms, after the app bundles on macOS). */
  commands?: string[]
  fileArgs: FileArgs
}

const vscodeLike = (id: EditorId, name: string, short: string, app: string, cli: string): EditorPreset => ({
  id,
  name,
  short,
  macApps: [`${app}.app`],
  macCli: `Contents/Resources/app/bin/${cli}`,
  commands: [cli],
  fileArgs: 'goto'
})

const jetbrains = (id: EditorId, name: string, apps: string[], command: string): EditorPreset => ({
  id,
  name,
  short: name.split(' ')[0],
  macApps: apps.map((a) => `${a}.app`),
  commands: [command],
  fileArgs: 'file'
})

export const EDITOR_PRESETS: EditorPreset[] = [
  vscodeLike('vscode', 'Visual Studio Code', 'VS Code', 'Visual Studio Code', 'code'),
  vscodeLike('vscode-insiders', 'VS Code Insiders', 'Insiders', 'Visual Studio Code - Insiders', 'code-insiders'),
  vscodeLike('cursor', 'Cursor', 'Cursor', 'Cursor', 'cursor'),
  vscodeLike('windsurf', 'Windsurf', 'Windsurf', 'Windsurf', 'windsurf'),
  {
    id: 'zed',
    name: 'Zed',
    short: 'Zed',
    macApps: ['Zed.app'],
    macCli: 'Contents/MacOS/cli',
    commands: ['zed', 'zeditor'],
    fileArgs: 'both'
  },
  {
    id: 'sublime',
    name: 'Sublime Text',
    short: 'Sublime',
    macApps: ['Sublime Text.app'],
    macCli: 'Contents/SharedSupport/bin/subl',
    commands: ['subl'],
    fileArgs: 'both'
  },
  jetbrains(
    'intellij',
    'IntelliJ IDEA',
    ['IntelliJ IDEA', 'IntelliJ IDEA Ultimate', 'IntelliJ IDEA CE', 'IntelliJ IDEA Community Edition'],
    'idea'
  ),
  jetbrains('webstorm', 'WebStorm', ['WebStorm'], 'webstorm'),
  jetbrains(
    'pycharm',
    'PyCharm',
    ['PyCharm', 'PyCharm Professional Edition', 'PyCharm CE', 'PyCharm Community Edition'],
    'pycharm'
  ),
  jetbrains('goland', 'GoLand', ['GoLand'], 'goland'),
  jetbrains('phpstorm', 'PhpStorm', ['PhpStorm'], 'phpstorm'),
  jetbrains('rubymine', 'RubyMine', ['RubyMine'], 'rubymine'),
  jetbrains('rider', 'Rider', ['Rider'], 'rider'),
  jetbrains('clion', 'CLion', ['CLion'], 'clion'),
  jetbrains('rustrover', 'RustRover', ['RustRover'], 'rustrover'),
  {
    id: 'android-studio',
    name: 'Android Studio',
    short: 'Studio',
    macApps: ['Android Studio.app'],
    commands: ['studio'],
    fileArgs: 'file'
  },
  {
    id: 'fleet',
    name: 'Fleet',
    short: 'Fleet',
    macApps: ['Fleet.app'],
    commands: ['fleet'],
    fileArgs: 'file'
  },
  {
    id: 'xcode',
    name: 'Xcode',
    short: 'Xcode',
    macApps: ['Xcode.app'],
    fileArgs: 'file'
  },
  {
    id: 'nova',
    name: 'Nova',
    short: 'Nova',
    macApps: ['Nova.app'],
    fileArgs: 'file'
  },
  {
    id: 'bbedit',
    name: 'BBEdit',
    short: 'BBEdit',
    macApps: ['BBEdit.app'],
    commands: ['bbedit'],
    fileArgs: 'file'
  }
]

export function editorPreset(id: EditorId): EditorPreset | undefined {
  return EDITOR_PRESETS.find((p) => p.id === id)
}

export interface EditorSettings {
  /** The editor the toolbar button opens; null means the first one installed. */
  editor: EditorId | null
  /** The command for 'custom'; $REPO is the repository folder, $FILE the file and $PATH whichever is opened. */
  customCommand: string
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  editor: null,
  customCommand: ''
}

export function normalizeEditorSettings(raw: Partial<EditorSettings> | undefined): EditorSettings {
  const editor = raw?.editor === 'custom' || editorPreset(raw?.editor as EditorId) ? (raw!.editor as EditorId) : null
  const customCommand = typeof raw?.customCommand === 'string' ? raw.customCommand : ''
  return { editor, customCommand }
}

/** An editor found on this machine, as the renderer lists it. */
export interface InstalledEditor {
  id: EditorId
  name: string
  short: string
}

export function customEditor(command: string): InstalledEditor | null {
  const program = splitCommand(command)[0]
  if (!program) return null
  const name = program.split(/[\\/]/).pop()!
  return { id: 'custom', name, short: name }
}

/**
 * The editor the toolbar opens: the one picked in Settings when it's still
 * installed (or the custom command, when there is one), otherwise the first
 * one found.
 */
export function chosenEditor(settings: EditorSettings, installed: InstalledEditor[]): InstalledEditor | null {
  if (settings.editor === 'custom') {
    const custom = customEditor(settings.customCommand)
    if (custom) return custom
  }
  return installed.find((e) => e.id === settings.editor) ?? installed[0] ?? null
}

/** The arguments for an editor's own command line tool: the repo, or a file (absolute) shown in the repo's window. */
export function editorArgs(preset: EditorPreset, repoPath: string, file?: string): string[] {
  if (!file) return [repoPath]
  if (preset.fileArgs === 'goto') return [repoPath, '--goto', file]
  if (preset.fileArgs === 'both') return [repoPath, file]
  return [file]
}

/**
 * The program and arguments for a custom editor command. $REPO, $FILE and
 * $PATH are replaced inside each word after splitting, so paths with spaces
 * stay one argument; a command with none of them gets the path at the end.
 */
export function customEditorArgs(
  template: string,
  repoPath: string,
  file?: string
): { program: string; args: string[] } {
  const target = file ?? repoPath
  const values: Record<string, string> = {
    REPO: repoPath,
    FILE: target,
    PATH: target
  }
  const placeholder = /\$\{?(REPO|FILE|PATH)\}?/g
  const words = splitCommand(template)
  if (words.length === 0) throw new Error('There is no editor command set in Settings.')
  const hasPlaceholder = words.some((w) => w.match(placeholder))
  const filled = words.map((w) => w.replace(placeholder, (_, name: string) => values[name]))
  return {
    program: filled[0],
    args: hasPlaceholder ? filled.slice(1) : [...filled.slice(1), target]
  }
}
