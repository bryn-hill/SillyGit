/**
 * Reflog entries for the reflog view: where HEAD or a branch has pointed,
 * newest first. Pure, so parsing can be tested without a repo.
 */

/** What kind of move an entry was, for its label colour. */
export type ReflogKind = 'commit' | 'amend' | 'merge' | 'rebase' | 'reset' | 'checkout' | 'pull' | 'pick' | 'branch' | 'other'

export interface ReflogEntry {
  hash: string
  shortHash: string
  /** `HEAD@{2}` or `main@{0}`: what git calls this entry. */
  selector: string
  /** The verb, e.g. "commit (amend)", "checkout", "merge feature". */
  action: string
  /** The rest of the reflog message, e.g. "moving from main to feature". */
  detail: string
  kind: ReflogKind
  /** Unix seconds when the ref moved here. */
  time: number
  /** The subject of the commit it points at. */
  subject: string
}

/** Fields, in order, joined by \x1f; pass with `--date=unix` so %gd carries the time. */
export const REFLOG_FORMAT = '%H%x1f%h%x1f%gd%x1f%gs%x1f%s'

export function reflogKind(action: string): ReflogKind {
  if (action === 'commit (amend)') return 'amend'
  if (action === 'commit (merge)' || action.startsWith('merge')) return 'merge'
  if (action.startsWith('commit')) return 'commit'
  if (action.startsWith('rebase')) return 'rebase'
  if (action === 'reset') return 'reset'
  if (action === 'checkout') return 'checkout'
  if (action.startsWith('pull')) return 'pull'
  if (action === 'cherry-pick' || action === 'revert') return 'pick'
  if (action === 'branch') return 'branch'
  return 'other'
}

/**
 * Parses `git reflog show --date=unix --format=REFLOG_FORMAT <ref>`. With a
 * unix date, %gd reads `HEAD@{1730000000}`, so the time comes from there and
 * the selector is rebuilt from the entry's position.
 */
export function parseReflog(out: string, ref: string): ReflogEntry[] {
  const name = ref.replace(/^refs\/heads\//, '')
  return out
    .split('\n')
    .filter((line) => line.includes('\x1f'))
    .map((line, index): ReflogEntry => {
      const [hash, shortHash, dated, message = '', subject = ''] = line.split('\x1f')
      const time = Number(dated.match(/@\{(\d+)\}$/)?.[1] ?? 0)
      const colon = message.indexOf(': ')
      const action = colon === -1 ? message : message.slice(0, colon)
      const detail = colon === -1 ? '' : message.slice(colon + 2)
      return {
        hash,
        shortHash,
        selector: `${name}@{${index}}`,
        action,
        detail,
        kind: reflogKind(action),
        time,
        subject
      }
    })
}
