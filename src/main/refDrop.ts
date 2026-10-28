import type { ConflictableResult, DropRelation } from '../shared/types'
import { getOperationState, runMayConflict } from './conflicts'
import { GitError, runGit } from './gitExec'

// What dragging a branch or commit onto another branch on the graph does,
// like GitKraken: merge, rebase or fast-forward one branch onto another, or
// cherry-pick commits onto a branch. Git only merges, rebases and picks into
// the checked-out branch, so these check the target out first when they need to.

// Keep git from opening an editor for commit messages it would ask about.
const NO_EDITOR = { GIT_EDITOR: 'true' }

async function revParse(repoPath: string, ref: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).trim()
}

async function isAncestor(repoPath: string, ancestor: string, of: string): Promise<boolean> {
  return runGit(repoPath, ['merge-base', '--is-ancestor', ancestor, of]).then(
    () => true,
    () => false
  )
}

async function currentBranch(repoPath: string): Promise<string | null> {
  const out = await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')
  return out.trim() || null
}

/** Whether there are changes to tracked files; untracked files go along with a checkout. */
async function hasTrackedChanges(repoPath: string): Promise<boolean> {
  const out = await runGit(repoPath, ['status', '--porcelain', '--untracked-files=no'])
  return out.trim().length > 0
}

/** How the dragged ref and the branch it was dropped on relate, which decides what the drop menu offers. */
export async function dropRelation(repoPath: string, source: string, target: string): Promise<DropRelation> {
  const [sourceHash, targetHash] = await Promise.all([revParse(repoPath, source), revParse(repoPath, target)])
  const [targetContainsSource, sourceContainsTarget] = await Promise.all([
    isAncestor(repoPath, sourceHash, targetHash),
    isAncestor(repoPath, targetHash, sourceHash)
  ])
  return { sourceHash, targetHash, targetContainsSource, sourceContainsTarget }
}

/**
 * Makes `branch` the checked-out branch for an operation that needs it. Refuses
 * when another operation is under way, or when switching would carry
 * uncommitted changes into the merge, rebase or cherry-pick.
 */
async function checkoutFor(repoPath: string, branch: string, what: string): Promise<void> {
  if (await getOperationState(repoPath)) {
    throw new GitError('Finish or abort the merge, rebase or cherry-pick in progress first.')
  }
  if ((await currentBranch(repoPath)) === branch) return
  if (await hasTrackedChanges(repoPath)) {
    throw new GitError(`Commit or stash your changes first: ${branch} has to be checked out to ${what}.`)
  }
  await runGit(repoPath, ['checkout', branch])
}

/** Merges `source` into the local branch `target`. */
export async function mergeInto(repoPath: string, source: string, target: string): Promise<ConflictableResult> {
  await checkoutFor(repoPath, target, `merge ${source} into it`)
  return runMayConflict(repoPath, ['merge', '--no-edit', source], NO_EDITOR)
}

/** Rebases the local branch `branch` onto `onto`, leaving `branch` checked out. */
export async function rebaseBranchOnto(repoPath: string, branch: string, onto: string): Promise<ConflictableResult> {
  await checkoutFor(repoPath, branch, `rebase it`)
  return runMayConflict(repoPath, ['rebase', onto], NO_EDITOR)
}

/**
 * Moves the local branch `target` forward to `source`. A branch that isn't
 * checked out moves without a checkout, so uncommitted changes don't matter.
 */
export async function fastForward(repoPath: string, target: string, source: string): Promise<void> {
  const { sourceHash, targetHash, sourceContainsTarget } = await dropRelation(repoPath, source, target)
  if (!sourceContainsTarget) {
    throw new GitError(`${target} can't be fast-forwarded to ${source}: it has commits ${source} doesn't.`)
  }
  if ((await currentBranch(repoPath)) === target) {
    await runGit(repoPath, ['merge', '--ff-only', source])
    return
  }
  // The old value makes this fail rather than lose a commit that landed meanwhile.
  await runGit(repoPath, [
    'update-ref',
    '-m',
    `fast-forward: ${target} to ${source}`,
    `refs/heads/${target}`,
    sourceHash,
    targetHash
  ])
}

/** Cherry-picks `hashes` (oldest first) onto the local branch `target`. */
export async function cherryPickOnto(repoPath: string, hashes: string[], target: string): Promise<ConflictableResult> {
  await checkoutFor(repoPath, target, 'cherry-pick onto it')
  return runMayConflict(repoPath, ['cherry-pick', ...hashes])
}
