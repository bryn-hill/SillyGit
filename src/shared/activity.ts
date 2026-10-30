/**
 * The activity log: the git commands SillyGit ran that changed something,
 * like GitKraken's Activity Logs. Reads (status, log, diff…) run constantly
 * and would bury everything else, so they're left out.
 */

export interface ActivityEntry {
  id: number
  /** Epoch milliseconds when the command started. */
  time: number
  repoPath: string
  /** The command as you'd type it, e.g. `git commit -m "Fix"`. */
  command: string
  durationMs: number
  ok: boolean
  error?: string
}

const READ_ONLY = new Set([
  'status',
  'log',
  'show',
  'diff',
  'rev-parse',
  'rev-list',
  'reflog',
  'symbolic-ref',
  'for-each-ref',
  'show-ref',
  'cat-file',
  'ls-files',
  'ls-tree',
  'ls-remote',
  'merge-base',
  'merge-tree',
  'blame',
  'describe',
  'format-patch',
  'read-tree',
  'check-ignore',
  'check-attr',
  'grep'
])

/** Whether running `git <args>` is worth a line in the activity log. */
export function isLoggedCommand(args: string[]): boolean {
  const [sub, ...rest] = args
  if (!sub || READ_ONLY.has(sub)) return false
  switch (sub) {
    case 'stash':
      return rest[0] !== 'list' && rest[0] !== 'show'
    case 'remote':
      return rest.length > 0 && rest[0] !== '-v' && rest[0] !== 'get-url' && rest[0] !== 'show'
    case 'worktree':
      return rest[0] !== 'list'
    case 'config':
      return !rest.some((a) => a === '--get' || a === '--get-all' || a === '--get-regexp' || a === '-l' || a === '--list')
    case 'branch':
      return !rest.some((a) => a === '--points-at' || a === '--list' || a.startsWith('--format') || a === '--show-current')
    case 'tag':
      return rest.length > 0 && rest[0] !== '-l' && rest[0] !== '--list'
    case 'lfs':
      // Looking (version, ls-files, status, env, a bare track) isn't worth a line.
      return !['version', 'ls-files', 'status', 'env', 'smudge', 'pointer'].includes(rest[0]) && !(rest[0] === 'track' && rest.length === 1)
    case 'apply':
      return !rest.includes('--check')
    default:
      return true
  }
}

/** Hides passwords and tokens in URLs, e.g. https://user:token@host → https://***@host. */
export function redactUrl(text: string): string {
  return text.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1***@')
}

/** `git <args>` as you'd type it in a shell, quoting arguments that need it. */
export function formatCommand(args: string[]): string {
  const parts = args.map((arg) => {
    const safe = redactUrl(arg)
    const firstLine = safe.split('\n')[0]
    const shown = firstLine.length < safe.length ? `${firstLine}…` : safe
    return /^[\w@%+=:,./^~{}*-]+$/.test(shown) ? shown : `"${shown.replace(/(["\\$`])/g, '\\$1')}"`
  })
  return ['git', ...parts].join(' ')
}
