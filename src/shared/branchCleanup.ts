import type { BranchInfo } from './types'
import { staleAge, type BranchListSettings } from './branchStatus'

/** A local branch the cleanup dialog offers to delete, and why. */
export interface CleanupCandidate {
  name: string
  hash: string
  /** Its upstream was deleted on the remote. */
  gone: boolean
  /** The branch it's fully merged into (e.g. "origin/main"), or null. */
  mergedInto: string | null
  /** Commits on it that no remote branch has. */
  localOnly: number
  /** When the tip commit was made, in Unix seconds. */
  lastCommitAt?: number
}

/** What a deleted branch needs to come back exactly as it was. */
export interface DeletedBranch {
  name: string
  hash: string
  /** `branch.<name>.remote` and `.merge`, so tracking comes back too. */
  remote?: string
  merge?: string
}

export type CleanupGroupId = 'gone' | 'merged' | 'stale'

export interface CleanupGroup {
  id: CleanupGroupId
  title: string
  candidates: CleanupCandidate[]
}

/**
 * Sorts candidates into the dialog's groups. A branch shows once, in the first
 * group that fits: gone, then merged, then stale. Fresh, unmerged branches with
 * a live upstream aren't offered at all.
 */
export function groupCandidates(
  candidates: CleanupCandidate[],
  nowMs: number,
  settings: BranchListSettings
): CleanupGroup[] {
  const gone: CleanupCandidate[] = []
  const merged: CleanupCandidate[] = []
  const stale: CleanupCandidate[] = []
  for (const c of candidates) {
    if (c.gone) gone.push(c)
    else if (c.mergedInto) merged.push(c)
    else if (candidateStaleAge(c, nowMs, settings)) stale.push(c)
  }
  const groups: CleanupGroup[] = [
    { id: 'gone', title: 'Deleted on remote', candidates: gone },
    { id: 'merged', title: 'Already merged', candidates: merged },
    { id: 'stale', title: `No commits in ${settings.staleDays}+ days`, candidates: stale }
  ]
  return groups.filter((g) => g.candidates.length > 0)
}

function candidateStaleAge(c: CleanupCandidate, nowMs: number, settings: BranchListSettings): string | null {
  return staleAge({ name: c.name, current: false, remote: false, lastCommitAt: c.lastCommitAt }, nowMs, settings)
}

/**
 * Whether a candidate starts ticked: merged and deleted-on-remote branches do.
 * A gone branch's commits are often missing from every remote after a squash
 * merge, so `localOnly` is shown as a warning rather than used to untick it.
 * Stale branches are a judgement call and start unticked.
 */
export function preselected(c: CleanupCandidate): boolean {
  return c.gone || c.mergedInto !== null
}

/**
 * How many local branches the sidebar banner says can be tidied: deleted on the
 * remote, or stale. The current branch and favourites never count.
 */
export function tidyCount(
  branches: BranchInfo[],
  favourites: ReadonlySet<string>,
  nowMs: number,
  settings: BranchListSettings
): number {
  return branches.filter(
    (b) => !b.remote && !b.current && !favourites.has(b.name) && (b.upstreamGone || staleAge(b, nowMs, settings) !== null)
  ).length
}

/** "3", or "99+" past 99 so the banner stays short. */
export function formatCount(n: number): string {
  return n > 99 ? '99+' : String(n)
}

export const CLEANUP_SNOOZE_DAYS = 30
