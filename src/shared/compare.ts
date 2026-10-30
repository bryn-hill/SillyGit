import type { CommitFileChange } from './types'

// Comparing two commits or branches: what changed between them and which commits each side has.

/** What to compare: the change from `from` to `to`, each a branch name or commit SHA. */
export interface CompareTarget {
  from: string
  to: string
}

/** A commit only one side of a comparison has. */
export interface CompareCommit {
  hash: string
  author: string
  authorEmail: string
  date: string
  subject: string
}

export interface Comparison {
  /** The commits each side resolved to when compared. */
  fromHash: string
  toHash: string
  /** The commit both sides grew from, or null for unrelated histories. */
  mergeBase: string | null
  /** The files that differ between the two, like `git diff from to`. */
  files: CommitFileChange[]
  /** Commits in `from` but not `to`, and in `to` but not `from`, newest first. */
  onlyFrom: CompareCommit[]
  onlyTo: CompareCommit[]
  /** More commits than were listed sit on one side or the other. */
  truncated: boolean
}

/** How many commits each comparison lists, across both sides. */
export const COMPARE_COMMIT_LIMIT = 500

const US = '\x1f'

/** The `git log --left-right` format `parseLeftRightLog` reads. */
export const LEFT_RIGHT_FORMAT = `%m${US}%H${US}%an${US}%ae${US}%ad${US}%s`

/** Splits `git log --left-right from...to` output into each side's commits. */
export function parseLeftRightLog(out: string): { onlyFrom: CompareCommit[]; onlyTo: CompareCommit[] } {
  const onlyFrom: CompareCommit[] = []
  const onlyTo: CompareCommit[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [mark, hash, author, authorEmail, date, ...subject] = line.split(US)
    if (!hash) continue
    const commit = { hash, author, authorEmail, date, subject: subject.join(US) }
    if (mark === '<') onlyFrom.push(commit)
    else if (mark === '>') onlyTo.push(commit)
  }
  return { onlyFrom, onlyTo }
}

/** A short name for one side: a branch as it is, a full SHA cut to 7 characters. */
export function compareLabel(ref: string): string {
  return /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref
}
