import { runGit, GitError } from './gitExec'
import { getBisectState } from './conflicts'
import type { BisectState, BisectVerdict } from '../shared/bisect'

// Guided bisect: starting one from a commit, marking commits good, bad or
// skipped, and resetting. `git bisect run` goes through the terminal instead
// (see bisectRunScript), so its output shows as it tests.

/** The git word for a verdict: the bisect's own terms for bad and good. */
function termFor(state: BisectState | null, verdict: BisectVerdict): string {
  if (verdict === 'skip') return 'skip'
  return state ? state.terms[verdict] : verdict
}

/**
 * Marks `hash` (or the checked-out commit) and returns where the bisect got
 * to. Git fails once only skipped commits are left; that's an ending, not an
 * error, so the state that says so is returned instead.
 */
export async function markBisect(repoPath: string, verdict: BisectVerdict, hash?: string): Promise<BisectState | null> {
  const before = await getBisectState(repoPath)
  if (!before) throw new GitError('No bisect is in progress.')
  try {
    await runGit(repoPath, ['bisect', termFor(before, verdict), ...(hash ? [hash] : [])])
  } catch (err) {
    const after = await getBisectState(repoPath)
    if (after && after.suspects.length > 0) return after
    throw err
  }
  return getBisectState(repoPath)
}

/** Starts bisecting with `hash` marked bad or good, or marks it if a bisect is already going. */
export async function startBisect(repoPath: string, hash: string, verdict: 'bad' | 'good'): Promise<BisectState | null> {
  if (!(await getBisectState(repoPath))) await runGit(repoPath, ['bisect', 'start'])
  return markBisect(repoPath, verdict, hash)
}

/** Ends the bisect and checks out what was checked out before it started. */
export async function resetBisect(repoPath: string): Promise<void> {
  await runGit(repoPath, ['bisect', 'reset'])
}
