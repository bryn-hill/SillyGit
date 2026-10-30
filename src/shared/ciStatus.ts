// CI results for commits in the graph: GitHub check runs and statuses, or
// Azure Pipelines builds, rolled up to one state per commit.

import type { PrCheck, PrCheckState } from './prReview'

/** How a failed check can be started again; checks without one can only be opened. */
export type CiRerun =
  | { kind: 'github-workflow-run'; id: number }
  | { kind: 'github-check-run'; id: number }
  | { kind: 'azure-build'; id: number }

export interface CiCheck extends PrCheck {
  rerun?: CiRerun
}

/** The dot's state: a commit with only neutral or skipped checks shows as neutral. */
export type CiState = 'success' | 'failure' | 'pending' | 'neutral'

export interface CommitCiStatus {
  sha: string
  state: CiState
  checks: CiCheck[]
}

/** CI status by commit; null means the host knows of no checks for it. */
export type CiStatusMap = Record<string, CommitCiStatus | null>

/** One state for a commit's checks: any failure wins, then anything still running. */
export function ciState(checks: Pick<PrCheck, 'state'>[]): CiState {
  if (checks.some((c) => c.state === 'failure')) return 'failure'
  if (checks.some((c) => c.state === 'pending')) return 'pending'
  if (checks.some((c) => c.state === 'success')) return 'success'
  return 'neutral'
}

const ORDER: Record<PrCheckState, number> = { failure: 0, pending: 1, success: 2, neutral: 3, skipped: 4 }

/** Failures first, then running, then the rest, each by name. */
export function sortChecks<T extends PrCheck>(checks: T[]): T[] {
  return [...checks].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name))
}

/** The dot's tooltip, e.g. "2 of 5 checks failed". */
export function ciSummary(status: CommitCiStatus): string {
  const { checks } = status
  const n = checks.length
  const counted = (count: number, what: string): string => (n === 1 ? `Check ${what}` : `${count} of ${n} checks ${what}`)
  const failed = checks.filter((c) => c.state === 'failure').length
  const pending = checks.filter((c) => c.state === 'pending').length
  if (failed) return counted(failed, 'failed')
  if (pending) return counted(pending, 'running')
  if (status.state === 'success') return n === 1 ? 'Check passed' : `All ${n} checks passed`
  return n === 1 ? 'Check skipped' : `${n} checks, none ran`
}

/** The failed checks that can be re-run, one per workflow run or build (re-running one re-runs its failed jobs). */
export function rerunTargets(checks: CiCheck[]): CiRerun[] {
  const seen = new Set<string>()
  const out: CiRerun[] = []
  for (const c of checks) {
    if (c.state !== 'failure' || !c.rerun) continue
    const key = `${c.rerun.kind}:${c.rerun.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c.rerun)
  }
  return out
}

/** Statuses that may still change are asked for again sooner than settled ones. */
export function cacheMs(status: CommitCiStatus | null): number {
  if (!status) return 2 * 60_000
  if (status.state === 'pending') return 20_000
  return 10 * 60_000
}

// Commits shown with a dot: every pushed branch tip, and this many of the newest commits.
export const RECENT_COMMITS = 30
// The most commits asked for at once.
export const MAX_CI_COMMITS = 80
