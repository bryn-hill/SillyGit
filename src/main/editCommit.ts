import { randomUUID } from 'crypto'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fixupMessage } from '../shared/absorb'
import { buildPatchForUnits, parseCommitDiff } from '../shared/diffSplit'
import { moveSteps, rewordSteps, squashSteps, type MoveDirection, type SquashMode } from '../shared/editCommit'
import type { RebaseCommit, RebaseStep } from '../shared/rebase'
import type { FixupResult } from '../shared/types'
import { getOperationState } from './conflicts'
import { autosquash, isPushed } from './fixup'
import { getCommitFileDiff } from './git/history'
import { GitError, runGit } from './gitExec'
import { listCommits, runRebase } from './rebase'

// Editing an older commit of the current branch in one step, without opening
// the rebase editor: reword it, move it past a neighbour, squash others into
// it, or take a file or hunk out of it and back into the working tree. The
// first three are interactive rebase plans (src/shared/editCommit.ts); taking
// a change out is a fixup that reverses it, squashed in like fixup.ts does.

/** The current branch's commits from `oldest` to HEAD, and where a rebase replaying them starts. */
interface Line {
  commits: RebaseCommit[]
  /** The rebase's upstream: `oldest`'s parent, or `--root`. */
  baseArgs: string[]
  oldest: string
}

async function resolve(repoPath: string, rev: string): Promise<string> {
  const hash = (await runGit(repoPath, ['rev-parse', '-q', '--verify', `${rev}^{commit}`]).catch(() => '')).trim()
  if (!hash) throw new GitError(`"${rev}" is not a commit.`)
  return hash
}

async function parentOf(repoPath: string, hash: string): Promise<string | null> {
  return (await runGit(repoPath, ['rev-parse', '-q', '--verify', `${hash}^`]).catch(() => '')).trim() || null
}

async function lineFrom(repoPath: string, oldest: string): Promise<Line> {
  if (await getOperationState(repoPath)) throw new GitError('Finish or abort the operation in progress first.')
  const branch = (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim()
  if (!branch) throw new GitError('Check out a branch first: this rewrites the branch you are on.')
  const inHistory = await runGit(repoPath, ['merge-base', '--is-ancestor', oldest, 'HEAD'])
    .then(() => true)
    .catch(() => false)
  if (!inHistory) throw new GitError(`That commit is not part of ${branch}'s history.`)
  const parent = await parentOf(repoPath, oldest)
  const revs = parent ? [`${parent}..HEAD`] : ['HEAD']
  const merges = Number((await runGit(repoPath, ['rev-list', '--merges', '--count', ...revs])).trim())
  if (merges > 0) throw new GitError('There is a merge in the way, so these commits can’t be rewritten in a straight line.')
  return { commits: await listCommits(repoPath, revs), baseArgs: parent ? [parent] : ['--root'], oldest }
}

/** Replays `line` as `steps` say, saying whether the rewritten commits had been pushed. */
async function rewrite(repoPath: string, line: Line, steps: RebaseStep[]): Promise<FixupResult> {
  const messages = new Map(line.commits.map((c) => [c.hash, c.message]))
  const pushed = await isPushed(repoPath, line.oldest)
  const result = await runRebase(repoPath, line.baseArgs, steps, (hash) => messages.get(hash) ?? '')
  return { ...result, pushed }
}

/** Gives `rev`, a commit of the current branch, a new message. */
export async function rewordCommit(repoPath: string, rev: string, message: string): Promise<FixupResult> {
  if (!message.trim()) throw new GitError('A commit message can’t be empty.')
  const line = await lineFrom(repoPath, await resolve(repoPath, rev))
  if (line.commits[0].message.trim() === message.trim()) throw new GitError('That is the message it already has.')
  return rewrite(repoPath, line, rewordSteps(line.commits.map((c) => c.hash), line.oldest, message))
}

/** Swaps `rev` with the commit just after it (up) or just before it (down). */
export async function moveCommit(repoPath: string, rev: string, direction: MoveDirection): Promise<FixupResult> {
  const hash = await resolve(repoPath, rev)
  let oldest = hash
  if (direction === 'down') {
    const parent = await parentOf(repoPath, hash)
    if (!parent) throw new GitError('That commit is already the oldest.')
    oldest = parent
  }
  const line = await lineFrom(repoPath, oldest)
  if (!line.commits.some((c) => c.hash === hash)) throw new GitError('That commit is not on the current branch.')
  let steps: RebaseStep[]
  try {
    steps = moveSteps(line.commits.map((c) => c.hash), hash, direction)
  } catch (err) {
    throw new GitError((err as Error).message)
  }
  return rewrite(repoPath, line, steps)
}

/** Folds `sources` into `target`, all commits of the current branch; see squashSteps. */
export async function squashCommits(
  repoPath: string,
  sources: string[],
  target: string,
  mode: SquashMode
): Promise<FixupResult> {
  if (sources.length === 0) throw new GitError('Pick the commits to squash.')
  const hashes = await Promise.all([...sources, target].map((rev) => resolve(repoPath, rev)))
  const into = hashes.pop()!
  // On a straight line of commits their common ancestor is the oldest of them.
  const oldest = (await runGit(repoPath, ['merge-base', '--octopus', into, ...hashes])).trim()
  if (oldest !== into && !hashes.includes(oldest)) throw new GitError('Those commits are not on one line of history.')
  const line = await lineFrom(repoPath, oldest)
  let steps: RebaseStep[]
  try {
    steps = squashSteps(line.commits.map((c) => c.hash), hashes, into, mode)
  } catch (err) {
    throw new GitError((err as Error).message)
  }
  return rewrite(repoPath, line, steps)
}

/**
 * Takes a change out of `rev`, a commit of the current branch, and leaves it
 * in the working tree: the whole of `path` (with `oldPath` for a rename), or
 * the hunk `unitId` of its diff (see parseCommitDiff). A commit that reverses
 * the change is made on HEAD and squashed into `rev`; the rebase's autostash
 * then carries the change itself, still on disk, across to the new commits.
 */
export async function uncommitChange(
  repoPath: string,
  rev: string,
  path: string,
  oldPath: string | null,
  unitId: string | null
): Promise<FixupResult> {
  const hash = await resolve(repoPath, rev)
  const line = await lineFrom(repoPath, hash)
  const paths = oldPath && oldPath !== path ? [path, oldPath] : [path]
  let patch: string
  if (unitId === null) {
    patch = await runGit(repoPath, ['show', '--format=', '--binary', '--no-renames', '--no-color', hash, '--', ...paths])
  } else {
    const { fileBlocks, units } = parseCommitDiff(await getCommitFileDiff(repoPath, hash, path, false, oldPath ?? undefined))
    if (!units.some((u) => u.id === unitId)) throw new GitError('That change no longer matches the commit; try again.')
    patch = buildPatchForUnits(fileBlocks, new Set([unitId]))
  }
  if (!patch.trim()) throw new GitError(`${path} has no changes in that commit.`)

  const head = (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim()
  const id = randomUUID()
  const patchFile = join(tmpdir(), `sillygit-uncommit-${id}.patch`)
  const indexFile = join(tmpdir(), `sillygit-uncommit-${id}.index`)
  // Built in a scratch index so the real index and working tree are untouched if it doesn't apply.
  const env = { GIT_INDEX_FILE: indexFile }
  const reversedTree = async (onto: string): Promise<string> => {
    await runGit(repoPath, ['read-tree', onto], env)
    await runGit(repoPath, ['apply', '--cached', '-R', '--whitespace=nowarn', patchFile], env)
    return (await runGit(repoPath, ['write-tree'], env)).trim()
  }
  let fixup: string
  let emptied: boolean
  try {
    await fsp.writeFile(patchFile, patch.endsWith('\n') ? patch : `${patch}\n`, 'utf-8')
    // Taking out everything the commit changed leaves it empty, so it goes altogether.
    const parent = await parentOf(repoPath, hash)
    const parentTree = parent ? await runGit(repoPath, ['rev-parse', `${parent}^{tree}`]) : await emptyTree(repoPath)
    emptied = (await reversedTree(hash)) === parentTree.trim()
    let tree: string
    try {
      tree = await reversedTree('HEAD')
    } catch {
      throw new GitError('A later commit changed the same lines, so this change can’t be taken out on its own.')
    }
    fixup = (await runGit(repoPath, ['commit-tree', tree, '-p', head, '-m', fixupMessage(hash)])).trim()
    await runGit(repoPath, ['update-ref', '-m', 'SillyGit: take a change out of an older commit', 'HEAD', fixup, head])
  } finally {
    await fsp.unlink(patchFile).catch(() => {})
    await fsp.unlink(indexFile).catch(() => {})
  }
  const pushed = await isPushed(repoPath, line.oldest)
  try {
    if (!emptied) return { ...(await autosquash(repoPath, hash)), pushed }
    const steps: RebaseStep[] = [...line.commits.map((c) => c.hash), fixup].map((h) => ({
      hash: h,
      action: h === hash || h === fixup ? 'drop' : 'pick'
    }))
    return { ...(await runRebase(repoPath, line.baseArgs, steps, () => '')), pushed }
  } catch (err) {
    // A rebase that never started leaves the reversing commit on top; take it off again.
    if (!(await getOperationState(repoPath))) await runGit(repoPath, ['reset', '-q', '--soft', head]).catch(() => {})
    throw err
  }
}

async function emptyTree(repoPath: string): Promise<string> {
  return runGit(repoPath, ['hash-object', '-t', 'tree', '/dev/null'])
}
