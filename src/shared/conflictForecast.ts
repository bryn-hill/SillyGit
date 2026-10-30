import type { BranchInfo } from './types'

/** A branch that would conflict with another if they were merged now. */
export interface ConflictWarning {
  /** The other branch, e.g. "origin/main" or the branch you're on. */
  with: string
  /** `target` is the branch it would normally merge into; `current` is the checked-out branch. */
  kind: 'target' | 'current'
  /** The files both sides changed in ways git can't combine. */
  files: string[]
}

/** Warnings by local branch name. Branches that would merge cleanly aren't listed. */
export type ConflictForecast = Record<string, ConflictWarning[]>

/** One merge to try: `branch` at `tip` into `other` at `otherTip`. */
export interface ForecastPair {
  branch: string
  tip: string
  other: string
  otherTip: string
  kind: ConflictWarning['kind']
}

/** The branch most work merges into, e.g. origin/main, and its local name. */
export interface ForecastTarget {
  ref: string
  local: string
  hash: string
}

/**
 * The merges worth trying: every local branch against the target, and every
 * other local branch against the current one. A branch isn't checked against
 * the target when it is the target (or tracks it), and the current branch
 * isn't checked twice when it's the target's local copy.
 */
export function forecastPairs(branches: BranchInfo[], target: ForecastTarget | null): ForecastPair[] {
  const local = branches.filter((b) => !b.remote && b.hash)
  const current = local.find((b) => b.current)
  const currentIsTarget = !!current && !!target && (current.name === target.local || current.upstream === target.ref)
  const pairs: ForecastPair[] = []
  for (const b of local) {
    const tip = b.hash!
    const isTarget = !!target && (b.name === target.local || b.upstream === target.ref)
    if (target && !isTarget && tip !== target.hash) {
      pairs.push({ branch: b.name, tip, other: target.ref, otherTip: target.hash, kind: 'target' })
    }
    if (current && !b.current && !isTarget && !currentIsTarget && tip !== current.hash && current.hash !== target?.hash) {
      pairs.push({ branch: b.name, tip, other: current.name, otherTip: current.hash!, kind: 'current' })
    }
  }
  return pairs
}

/**
 * Reads `git merge-tree --write-tree --name-only --no-messages -z`: the
 * merged tree's id, then each conflicted path, all NUL-terminated. A path
 * with several conflict stages is listed once.
 */
export function parseMergeTreeNames(stdout: string): { tree: string; files: string[] } {
  const [tree = '', ...rest] = stdout.split('\0')
  return { tree: tree.trim(), files: [...new Set(rest.filter(Boolean))] }
}

/** A key that changes whenever any branch tip does, to know when to ask again. */
export function forecastKey(branches: BranchInfo[]): string {
  return branches.map((b) => `${b.current ? '*' : ''}${b.name}=${b.hash ?? ''}`).join('\n')
}

/** "a.ts", "a.ts and b.ts", "a.ts, b.ts and 3 more files". */
export function fileList(files: string[], shown = 2): string {
  if (files.length <= shown + 1) {
    return files.length <= 1 ? (files[0] ?? '') : `${files.slice(0, -1).join(', ')} and ${files[files.length - 1]}`
  }
  return `${files.slice(0, shown).join(', ')} and ${files.length - shown} more files`
}

/** One line for each warning, for the tag's accessible label. */
export function conflictSummary(warnings: ConflictWarning[]): string {
  return warnings.map((w) => `Would conflict with ${w.with} in ${fileList(w.files)}`).join('. ')
}
