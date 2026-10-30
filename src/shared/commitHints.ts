// Help for writing commit messages that comes from the repo itself: git's
// commit.template, the user's recent messages, and the Conventional Commits
// types and scopes the history already uses.

export interface CommitHints {
  /** commit.template with git's `#` comment lines taken out; null when there's none. */
  template: string | null
  /** The user's own recent messages, newest first, one per subject. */
  recent: string[]
  /** Conventional Commits scopes from the history, most used first. */
  scopes: string[]
  /** Conventional Commits types from the history, most used first. */
  types: string[]
}

export const NO_HINTS: CommitHints = { template: null, recent: [], scopes: [], types: [] }

/** The Conventional Commits types offered even before the history uses them. */
export const CONVENTIONAL_TYPES = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'ci', 'build', 'perf', 'style', 'revert']

/** How many recent messages the menu lists. */
export const RECENT_LIMIT = 15

/** Drops the `#` lines git strips from a template, and blank lines around the rest. */
export function cleanTemplate(text: string): string | null {
  const kept = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
  return kept.trim() ? kept : null
}

export interface ConventionalSubject {
  type: string
  scope: string | null
  breaking: boolean
  description: string
}

const CONVENTIONAL = /^([a-z][a-z0-9-]*)(?:\(([^()\s][^()]*)\))?(!)?: ?(.*)$/

/** `feat(api)!: drop v1` -> its parts; null when the subject isn't conventional. */
export function parseConventional(subject: string): ConventionalSubject | null {
  const m = CONVENTIONAL.exec(subject)
  if (!m) return null
  return { type: m[1], scope: m[2]?.trim() ?? null, breaking: !!m[3], description: m[4] }
}

/** Puts `type(scope): ` on the first line, replacing any conventional prefix there. Keeps a `!`. */
export function applyConventional(message: string, type: string, scope: string | null): string {
  const newline = message.indexOf('\n')
  const subject = newline === -1 ? message : message.slice(0, newline)
  const rest = newline === -1 ? '' : message.slice(newline)
  const parsed = parseConventional(subject)
  const description = parsed ? parsed.description : subject.trimStart()
  const bang = parsed?.breaking ? '!' : ''
  return `${type}${scope ? `(${scope})` : ''}${bang}: ${description}${rest}`
}

function byCount(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  // Map keeps first-seen order, and the log is newest first, so ties go to the more recent.
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
}

/** The types and scopes conventional subjects use, most used first. */
export function learnConventional(subjects: string[]): { types: string[]; scopes: string[] } {
  const parsed = subjects.map(parseConventional).filter((p): p is ConventionalSubject => p !== null)
  return {
    types: byCount(parsed.map((p) => p.type)),
    scopes: byCount(parsed.flatMap((p) => (p.scope ? p.scope.split(',').map((s) => s.trim()) : [])).filter(Boolean))
  }
}

/** The menu's types: the history's first, then the standard ones it hasn't used. */
export function typeChoices(learned: string[]): string[] {
  return [...new Set([...learned, ...CONVENTIONAL_TYPES])]
}

/**
 * Messages from `git log --format=%B%x00`, newest first: one per subject
 * (the newest), leaving out fixup!/squash! commits and the template itself.
 */
export function parseRecentMessages(log: string, template: string | null, limit = RECENT_LIMIT): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of log.split('\0')) {
    const message = raw.trim()
    const subject = message.split('\n')[0].trim()
    if (!subject || /^(fixup|squash|amend)! /.test(subject) || message === template?.trim()) continue
    if (seen.has(subject)) continue
    seen.add(subject)
    out.push(message)
    if (out.length >= limit) break
  }
  return out
}

/** True when the message is just the template, untouched, so there's nothing to commit yet. */
export function isUntouchedTemplate(message: string, template: string | null): boolean {
  return !!template && message.trim() === template.trim()
}
