import { planUndo, type UndoPlan } from '../../shared/undo'
import { getOperationState } from '../conflicts'
import { GitError, runGit } from '../gitExec'

// Undo and redo of the last git action, from the reflog.

async function newestReflogSubject(repoPath: string, ref: string): Promise<string | null> {
  try {
    const out = await runGit(repoPath, ['reflog', 'show', '-n', '1', '--format=%gs', ref, '--'])
    return out.trim() || null
  } catch {
    return null
  }
}

async function undoPlan(repoPath: string): Promise<{ plan: UndoPlan; ref: string } | null> {
  if (await getOperationState(repoPath)) return null
  let branch: string | null = null
  try {
    branch = (await runGit(repoPath, ['symbolic-ref', '-q', '--short', 'HEAD'])).trim() || null
  } catch {
    branch = null
  }
  const ref = branch ? `refs/heads/${branch}` : 'HEAD'
  const [headSubject, refSubject] = await Promise.all([
    newestReflogSubject(repoPath, 'HEAD'),
    newestReflogSubject(repoPath, ref)
  ])
  const plan = planUndo(headSubject, refSubject)
  if (!plan) return null
  if (plan.kind === 'reset') {
    // A reset to the commit it was already on (e.g. `git reset --hard` to
    // throw away edits) moved nothing, so there's nothing to go back to.
    try {
      const [now, before] = (await runGit(repoPath, ['rev-parse', ref, `${ref}@{1}`])).trim().split('\n')
      if (now === before) return null
    } catch {
      return null
    }
  }
  return { plan, ref }
}

/** What Undo would do right now, for the button's tooltip, or null when there's nothing to undo. */
export async function undoLabel(repoPath: string): Promise<string | null> {
  return (await undoPlan(repoPath))?.plan.label ?? null
}

/**
 * Moves the checked-out branch (or a detached HEAD) to `target` the way an
 * undo plan's mode says to, refusing to throw uncommitted changes away.
 */
async function resetForPlan(
  repoPath: string,
  target: string,
  mode: 'soft' | 'keep' | 'keep-or-mixed',
  label: string
): Promise<void> {
  if (mode === 'soft') {
    await runGit(repoPath, ['reset', '--soft', target])
    return
  }
  try {
    await runGit(repoPath, ['reset', '--keep', target])
  } catch {
    if (mode !== 'keep-or-mixed') {
      throw new GitError(
        `Couldn't ${label.toLowerCase()} without touching your uncommitted changes. Commit or stash them first.`
      )
    }
    // A soft or mixed reset left the undone commits' changes in the working
    // tree; a mixed reset back takes them up again without touching files.
    await runGit(repoPath, ['reset', '--mixed', '--quiet', target])
  }
}

/**
 * What Redo would put back: the last undo, as long as nothing has moved HEAD
 * since. Kept in memory only, like an editor's redo stack.
 */
interface RedoState {
  plan: UndoPlan
  label: string
  /** The branch (or commit, when detached) to check out, or the commit to reset to. */
  target: string
  /** Where HEAD was, and on which branch, straight after the undo. */
  head: string
  branch: string | null
}

const redoStates = new Map<string, RedoState>()

async function currentBranch(repoPath: string): Promise<string | null> {
  try {
    return (await runGit(repoPath, ['symbolic-ref', '-q', '--short', 'HEAD'])).trim() || null
  } catch {
    return null
  }
}

async function headHash(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim()
}

/** Undoes the last commit, amend, checkout, merge, pull, rebase, reset, cherry-pick or revert. */
export async function undo(repoPath: string): Promise<string> {
  const found = await undoPlan(repoPath)
  if (!found) throw new GitError('There is nothing SillyGit can undo.')
  const { plan, ref } = found
  const branchBefore = await currentBranch(repoPath)
  const headBefore = await headHash(repoPath)
  if (plan.kind === 'checkout') {
    await runGit(repoPath, ['checkout', plan.target])
  } else {
    await resetForPlan(repoPath, `${ref}@{1}`, plan.mode, plan.label)
  }
  redoStates.set(repoPath, {
    plan,
    label: plan.label.replace(/^Undo/, 'Redo'),
    target: plan.kind === 'checkout' ? (branchBefore ?? headBefore) : headBefore,
    head: await headHash(repoPath),
    branch: await currentBranch(repoPath)
  })
  return plan.label
}

async function validRedo(repoPath: string): Promise<RedoState | null> {
  const state = redoStates.get(repoPath)
  if (!state) return null
  try {
    const moved =
      (await getOperationState(repoPath)) !== null ||
      (await headHash(repoPath)) !== state.head ||
      (await currentBranch(repoPath)) !== state.branch
    if (!moved) return state
  } catch {
    // An unborn or broken HEAD: nothing sensible to redo.
  }
  redoStates.delete(repoPath)
  return null
}

/** What Redo would do right now, e.g. "Redo commit “x”", or null when there's nothing to redo. */
export async function redoLabel(repoPath: string): Promise<string | null> {
  return (await validRedo(repoPath))?.label ?? null
}

/** Puts back what the last Undo took away. */
export async function redo(repoPath: string): Promise<string> {
  const state = await validRedo(repoPath)
  if (!state) throw new GitError('There is nothing to redo.')
  if (state.plan.kind === 'checkout') {
    await runGit(repoPath, ['checkout', state.target])
  } else {
    await resetForPlan(repoPath, state.target, state.plan.mode, state.label)
  }
  redoStates.delete(repoPath)
  return state.label
}
