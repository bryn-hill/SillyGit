import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { ConflictableResult } from '../../shared/types'
import { COMPARE_COMMIT_LIMIT, LEFT_RIGHT_FORMAT, parseLeftRightLog, type Comparison } from '../../shared/compare'
import * as diffSplit from '../../shared/diffSplit'
import { hasUnmergedPaths, runMayConflict } from '../conflicts'
import { GitError, runGit } from '../gitExec'
import { getHeadHash, getTreeHash, parseNameStatus } from './history'
import { markLfs } from './lfs'
import { isWorkingTreeClean } from './workingTree'

// Applying commits elsewhere: cherry-pick, revert, patches, and splitting a commit or reverting one hunk.
// Also comparing two commits or branches.

/**
 * Applies a patch file (from `git format-patch` or `git diff`) to the working
 * tree and index, falling back to a three-way merge that leaves conflicts to
 * resolve when it doesn't apply cleanly.
 */
export async function applyPatch(repoPath: string, patchPath: string): Promise<ConflictableResult> {
  try {
    await runGit(repoPath, ['apply', '--3way', '--whitespace=nowarn', patchPath])
    return { conflicts: false }
  } catch (err) {
    if (await hasUnmergedPaths(repoPath)) return { conflicts: true }
    throw err
  }
}

export async function getDiffForSplit(
  repoPath: string,
  parentHash: string,
  headHash: string
): Promise<string> {
  return runGit(repoPath, ['diff', '--no-color', '--binary', parentHash, headHash])
}

interface SplitCommitGroup {
  message: string
  patch: string
}

/**
 * Replaces the commit at `originalHead` (which must be the current HEAD and have
 * exactly one parent, `parentHash`) with one commit per group, applied in order.
 * Each group's `patch` must be the CUMULATIVE patch (this group's units plus every
 * earlier group's units) built against `parentHash`, so that `git apply --cached`
 * always starts from a clean, known base. Verifies the resulting tree matches
 * `expectedTreeHash` (the original commit's tree) and hard-resets back to
 * `originalHead` if anything doesn't check out, leaving the repo untouched.
 */
export async function applyCommitSplit(
  repoPath: string,
  originalHead: string,
  parentHash: string,
  expectedTreeHash: string,
  groups: SplitCommitGroup[]
): Promise<void> {
  const currentHead = await getHeadHash(repoPath)
  if (currentHead !== originalHead) {
    throw new GitError('HEAD has changed since the split was proposed. Please try again.')
  }
  if (!(await isWorkingTreeClean(repoPath))) {
    throw new GitError('Working directory must be clean before splitting a commit.')
  }

  await runGit(repoPath, ['reset', '--soft', parentHash])

  try {
    for (const group of groups) {
      await runGit(repoPath, ['read-tree', parentHash])
      const patchFile = join(tmpdir(), `sillygit-split-${randomUUID()}.patch`)
      await fsp.writeFile(patchFile, group.patch, 'utf-8')
      try {
        await runGit(repoPath, ['apply', '--cached', '--binary', '--whitespace=nowarn', patchFile])
      } finally {
        await fsp.unlink(patchFile).catch(() => {})
      }
      await runGit(repoPath, ['commit', '-m', group.message])
    }

    const newTree = await getTreeHash(repoPath, 'HEAD')
    if (newTree !== expectedTreeHash) {
      throw new GitError('Split result did not match the original commit; reverted.')
    }
  } catch (err) {
    await runGit(repoPath, ['reset', '--hard', originalHead]).catch(() => {})
    throw err
  }
}

/**
 * Reverts a single hunk (identified by the stable unit id from `diffSplit.parseCommitDiff`)
 * by rebuilding a standalone patch for just that hunk and reverse-applying it to the
 * current WORKING TREE. This never touches the commit `diffText` was taken from — reverting
 * a hunk from a historical commit just undoes that one change in today's files, the same way
 * a normal uncommitted edit would. Fails loudly (rather than partially) if the file has
 * drifted too far since that commit for the patch context to match.
 */
export async function revertHunk(repoPath: string, diffText: string, unitId: string): Promise<void> {
  const { fileBlocks, units } = diffSplit.parseCommitDiff(diffText)
  if (!units.some((u) => u.id === unitId)) {
    throw new GitError('That change no longer matches the current diff; try again.')
  }
  const patch = diffSplit.buildPatchForUnits(fileBlocks, new Set([unitId]))
  const patchFile = join(tmpdir(), `sillygit-revert-${randomUUID()}.patch`)
  await fsp.writeFile(patchFile, patch, 'utf-8')
  try {
    await runGit(repoPath, ['apply', '-R', '--whitespace=nowarn', patchFile])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new GitError(
      `Could not revert this change — the file has likely changed since this commit. (${message})`
    )
  } finally {
    await fsp.unlink(patchFile).catch(() => {})
  }
}

/** Picks one commit, or several in the order given (oldest first). */
export async function cherryPick(repoPath: string, hash: string | string[]): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['cherry-pick', ...[hash].flat()])
}

/** Reverts one commit, or several in the order given (newest first). */
export async function revertCommit(repoPath: string, hash: string | string[]): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['revert', '--no-edit', ...[hash].flat()])
}

export async function createPatchFromCommit(repoPath: string, hash: string): Promise<string> {
  return runGit(repoPath, ['format-patch', '-1', hash, '--stdout'])
}

/** The commit a branch, tag or SHA points at; names starting with "-" can't pass for options. */
async function resolveCommit(repoPath: string, ref: string): Promise<string> {
  try {
    return (await runGit(repoPath, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`])).trim()
  } catch {
    throw new GitError(`Can't find ${ref} to compare.`)
  }
}

/**
 * What changed from `from` to `to` (`git diff from to`), and the commits
 * each has that the other doesn't (`git log --left-right from...to`).
 */
export async function compareRefs(repoPath: string, from: string, to: string): Promise<Comparison> {
  const [fromHash, toHash] = await Promise.all([resolveCommit(repoPath, from), resolveCommit(repoPath, to)])
  const [names, log, mergeBase] = await Promise.all([
    runGit(repoPath, ['diff', '--no-color', '--name-status', '-M', fromHash, toHash]),
    runGit(repoPath, [
      'log',
      '--left-right',
      `--max-count=${COMPARE_COMMIT_LIMIT + 1}`,
      `--format=${LEFT_RIGHT_FORMAT}`,
      '--date=iso-strict',
      `${fromHash}...${toHash}`
    ]),
    // Exits 1 when the histories share nothing.
    runGit(repoPath, ['merge-base', fromHash, toHash]).then(
      (out) => out.trim() || null,
      () => null
    )
  ])
  const files = parseNameStatus(names.split('\n'))
  await markLfs(repoPath, files, toHash)
  const { onlyFrom, onlyTo } = parseLeftRightLog(log)
  const truncated = onlyFrom.length + onlyTo.length > COMPARE_COMMIT_LIMIT
  if (truncated) (onlyTo.length > onlyFrom.length ? onlyTo : onlyFrom).pop()
  return { fromHash, toHash, mergeBase, files, onlyFrom, onlyTo, truncated }
}

/** One file's diff between two commits, following a rename when `oldPath` names it. */
export async function getCompareFileDiff(
  repoPath: string,
  fromHash: string,
  toHash: string,
  path: string,
  ignoreWhitespace = false,
  oldPath?: string
): Promise<string> {
  const args = ['diff', '--no-color', '-M']
  if (ignoreWhitespace) args.push('-w')
  args.push(fromHash, toHash, '--', path)
  if (oldPath && oldPath !== path) args.push(oldPath)
  return runGit(repoPath, args)
}
