// Custom commands: shell commands the user adds in Settings, offered in the
// right-click menus and the command palette, and run in the terminal with
// placeholders filled in from what they were run on.

/** What a command acts on, which decides the menus it shows in. */
export type CustomCommandScope = 'repo' | 'commit' | 'branch' | 'file'

export interface CustomCommand {
  id: string
  name: string
  /** A shell command; see PLACEHOLDERS for what it can refer to. */
  command: string
  scope: CustomCommandScope
}

export const SCOPE_LABELS: Record<CustomCommandScope, string> = {
  repo: 'Repository',
  commit: 'Commit',
  branch: 'Branch',
  file: 'File'
}

/** What a command was run on. */
export interface CommandTarget {
  repo: string
  currentBranch?: string | null
  sha?: string
  branch?: string
  file?: string
}

export const PLACEHOLDERS: { name: string; description: string; value: (t: CommandTarget) => string | null | undefined }[] = [
  { name: '$REPO', description: 'the repository folder', value: (t) => t.repo },
  { name: '$CURRENT_BRANCH', description: 'the checked-out branch', value: (t) => t.currentBranch },
  { name: '$SHA', description: 'the commit', value: (t) => t.sha },
  { name: '$SHORT_SHA', description: 'the commit, abbreviated', value: (t) => t.sha?.slice(0, 7) },
  { name: '$BRANCH', description: 'the branch', value: (t) => t.branch },
  { name: '$FILE', description: 'the file, relative to the repository', value: (t) => t.file }
]

/** Quotes a value for sh, so paths and names with spaces or quotes stay one argument. */
export function shQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * The command with its placeholders filled in and quoted. Longer names are
 * matched first, so $SHORT_SHA isn't read as $SHORT followed by junk. Throws
 * when the command refers to something the target doesn't have.
 */
export function expandCommand(command: string, target: CommandTarget): string {
  const names = PLACEHOLDERS.map((p) => p.name.slice(1)).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`\\$(?:\\{(${names.join('|')})\\}|(${names.join('|')})(?![A-Za-z0-9_]))`, 'g')
  return command.replace(pattern, (_, braced: string | undefined, bare: string | undefined) => {
    const name = `$${braced ?? bare}`
    const value = PLACEHOLDERS.find((p) => p.name === name)!.value(target)
    if (value == null || value === '') throw new Error(`${name} has no value here.`)
    return shQuote(value)
  })
}

/** Keeps well-formed commands from whatever was saved. */
export function normalizeCustomCommands(raw: unknown): CustomCommand[] {
  if (!Array.isArray(raw)) return []
  const scopes = Object.keys(SCOPE_LABELS)
  return raw.flatMap((c, i): CustomCommand[] => {
    if (!c || typeof c !== 'object') return []
    const { id, name, command, scope } = c as Partial<CustomCommand>
    if (typeof name !== 'string' || typeof command !== 'string') return []
    return [
      {
        id: typeof id === 'string' && id ? id : `cmd-${i}`,
        name,
        command,
        scope: scopes.includes(scope as string) ? (scope as CustomCommandScope) : 'repo'
      }
    ]
  })
}

/** The commands a menu for `scope` offers, ready to show: named and with a command. */
export function commandsFor(commands: CustomCommand[], scope: CustomCommandScope): CustomCommand[] {
  return commands.filter((c) => c.scope === scope && c.name.trim() && c.command.trim())
}
