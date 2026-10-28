// External merge tools: the presets offered in Settings and how a command
// template becomes the arguments of the process to run. Pure, so the main
// process (which launches the tool) and the renderer (which shows its name)
// share it.

/** 'none' means only the built-in merge tool; 'git' runs `git mergetool`, which uses git config's merge.tool. */
export type MergeToolId =
  | 'none'
  | 'git'
  | 'vscode'
  | 'cursor'
  | 'kaleidoscope'
  | 'filemerge'
  | 'beyondcompare'
  | 'p4merge'
  | 'smerge'
  | 'meld'
  | 'custom'

export interface MergeToolSettings {
  tool: MergeToolId
  /** The command for 'custom', with $LOCAL, $REMOTE, $BASE and $MERGED placeholders. */
  customCommand: string
}

export const DEFAULT_MERGE_TOOL_SETTINGS: MergeToolSettings = { tool: 'none', customCommand: '' }

export interface MergeToolPreset {
  id: MergeToolId
  name: string
  /** Command template; $LOCAL is the current side, $REMOTE the incoming side, $MERGED the file in the repo. */
  command?: string
  /** Where the executable lives when it isn't on PATH (macOS app bundles mostly). */
  fallbacks?: string[]
}

// The argument orders follow git's own mergetools definitions.
export const MERGE_TOOL_PRESETS: MergeToolPreset[] = [
  { id: 'none', name: 'Built-in merge tool only' },
  { id: 'git', name: 'Git config (merge.tool)' },
  {
    id: 'vscode',
    name: 'VS Code',
    command: 'code --wait --merge $REMOTE $LOCAL $BASE $MERGED',
    fallbacks: ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code']
  },
  {
    id: 'cursor',
    name: 'Cursor',
    command: 'cursor --wait --merge $REMOTE $LOCAL $BASE $MERGED',
    fallbacks: ['/Applications/Cursor.app/Contents/Resources/app/bin/cursor']
  },
  {
    id: 'kaleidoscope',
    name: 'Kaleidoscope',
    command: 'ksdiff --merge --output $MERGED --base $BASE -- $LOCAL --snapshot $REMOTE --snapshot',
    fallbacks: ['/Applications/Kaleidoscope.app/Contents/MacOS/ksdiff', '/Applications/Kaleidoscope.app/Contents/Resources/bin/ksdiff']
  },
  {
    id: 'filemerge',
    name: 'FileMerge (opendiff)',
    command: 'opendiff $LOCAL $REMOTE -ancestor $BASE -merge $MERGED',
    fallbacks: ['/usr/bin/opendiff']
  },
  {
    id: 'beyondcompare',
    name: 'Beyond Compare',
    command: 'bcomp $LOCAL $REMOTE $BASE -mergeoutput=$MERGED',
    fallbacks: ['/Applications/Beyond Compare.app/Contents/MacOS/bcomp']
  },
  {
    id: 'p4merge',
    name: 'P4Merge',
    command: 'p4merge $BASE $LOCAL $REMOTE $MERGED',
    fallbacks: ['/Applications/p4merge.app/Contents/MacOS/p4merge']
  },
  {
    id: 'smerge',
    name: 'Sublime Merge',
    command: 'smerge mergetool $BASE $LOCAL $REMOTE -o $MERGED',
    fallbacks: ['/Applications/Sublime Merge.app/Contents/SharedSupport/bin/smerge']
  },
  {
    id: 'meld',
    name: 'Meld',
    command: 'meld $LOCAL $BASE $REMOTE --output=$MERGED',
    fallbacks: ['/Applications/Meld.app/Contents/MacOS/Meld']
  },
  { id: 'custom', name: 'Custom command' }
]

export function mergeToolPreset(id: MergeToolId): MergeToolPreset | undefined {
  return MERGE_TOOL_PRESETS.find((p) => p.id === id)
}

export function normalizeMergeToolSettings(raw: Partial<MergeToolSettings> | undefined): MergeToolSettings {
  const tool = mergeToolPreset(raw?.tool as MergeToolId) ? (raw!.tool as MergeToolId) : 'none'
  const customCommand = typeof raw?.customCommand === 'string' ? raw.customCommand : ''
  return { tool, customCommand }
}

/** The tool's name for "Open in …", or null when no external tool is set up. */
export function mergeToolName(settings: MergeToolSettings): string | null {
  if (settings.tool === 'none') return null
  if (settings.tool === 'custom') {
    const program = splitCommand(settings.customCommand)[0]
    return program ? program.split(/[\\/]/).pop()! : null
  }
  return mergeToolPreset(settings.tool)?.name ?? null
}

/**
 * Splits a command line into words like a shell would, without running one:
 * whitespace separates words, and single or double quotes (or a backslash)
 * keep spaces inside a word. Nothing is expanded.
 */
export function splitCommand(command: string): string[] {
  const words: string[] = []
  let word = ''
  let inWord = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && (command[i + 1] === '"' || command[i + 1] === '\\')) word += command[++i]
      else word += c
    } else if (c === '"' || c === "'") {
      quote = c
      inWord = true
    } else if (c === '\\' && i + 1 < command.length) {
      word += command[++i]
      inWord = true
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word)
      word = ''
      inWord = false
    } else {
      word += c
      inWord = true
    }
  }
  if (inWord) words.push(word)
  return words
}

export interface MergeToolFiles {
  LOCAL: string
  REMOTE: string
  BASE: string
  MERGED: string
}

/**
 * The program and arguments for a command template. Placeholders ($LOCAL or
 * ${LOCAL}) are replaced inside each word after splitting, so a path with
 * spaces or quotes stays one argument and is never seen by a shell.
 */
export function buildMergeToolArgs(template: string, files: MergeToolFiles): { program: string; args: string[] } {
  const words = splitCommand(template).map((w) =>
    w.replace(/\$\{?(LOCAL|REMOTE|BASE|MERGED)\}?/g, (_, name: keyof MergeToolFiles) => files[name])
  )
  if (words.length === 0) throw new Error('There is no merge tool configured in your settings.')
  return { program: words[0], args: words.slice(1) }
}
