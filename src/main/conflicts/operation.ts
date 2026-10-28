import { promises as fsp } from 'fs'
import { join } from 'path'
import type { ConflictableResult, OperationState } from '../../shared/types'
import { GitError, runGit } from '../gitExec'

// The merge, rebase, cherry-pick or revert in progress: reading its state
// from the git directory, starting merges and rebases, and continuing,
// skipping or aborting.

export async function gitDir(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', '--absolute-git-dir'])).trim()
}

async function exists(path: string): Promise<boolean> {
  return fsp
    .access(path)
    .then(() => true)
    .catch(() => false)
}

export async function readTrimmed(path: string): Promise<string | null> {
  return fsp
    .readFile(path, 'utf-8')
    .then((s) => s.trim())
    .catch(() => null)
}

async function currentBranch(repoPath: string): Promise<string> {
  const out = await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')
  return out.trim() || 'HEAD'
}

/** "abc1234 Subject" for a commit, or just the short hash if it can't be read. */
async function describeCommit(repoPath: string, rev: string): Promise<string> {
  const out = await runGit(repoPath, ['log', '-1', '--format=%h %s', rev]).catch(() => '')
  return out.trim() || rev.slice(0, 7)
}

/** A branch pointing at `rev`, else its short hash. */
async function branchAt(repoPath: string, rev: string): Promise<string> {
  const out = await runGit(repoPath, ['branch', '--points-at', rev, '--format=%(refname:short)']).catch(() => '')
  const name = out
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('('))
  return name ?? rev.slice(0, 7)
}

function cleanMessage(raw: string | null): string | undefined {
  if (!raw) return undefined
  const text = raw
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim()
  return text || undefined
}

/**
 * The branches named by git's merge message: "feature" from "Merge branch
 * 'feature'", or "alpha, beta and gamma" from an octopus merge's "Merge
 * branches 'alpha', 'beta' and 'gamma'".
 */
function mergedBranchesLabel(message: string | undefined): string | undefined {
  const names = message?.match(/^Merge (?:remote-tracking )?branch(?:es)? ('[^']+'(?:(?:, | and )'[^']+')*)/)?.[1]
  return names?.replace(/'([^']+)'/g, '$1')
}

export async function getOperationState(repoPath: string): Promise<OperationState | null> {
  const dir = await gitDir(repoPath)

  for (const name of ['rebase-merge', 'rebase-apply']) {
    const rebaseDir = join(dir, name)
    if (!(await exists(rebaseDir))) continue
    // rebase-apply is also used by `git am`, which has no head-name.
    const headName = await readTrimmed(join(rebaseDir, 'head-name'))
    if (headName === null) continue
    const onto = await readTrimmed(join(rebaseDir, 'onto'))
    const [stepFile, totalFile] = name === 'rebase-merge' ? ['msgnum', 'end'] : ['next', 'last']
    const step = Number(await readTrimmed(join(rebaseDir, stepFile))) || undefined
    const total = Number(await readTrimmed(join(rebaseDir, totalFile))) || undefined
    const branch = headName.replace(/^refs\/heads\//, '')
    const replaying = (await exists(join(dir, 'REBASE_HEAD')))
      ? await describeCommit(repoPath, 'REBASE_HEAD')
      : null
    return {
      kind: 'rebase',
      currentLabel: onto ? await branchAt(repoPath, onto) : 'upstream',
      incomingLabel: replaying ? `${branch}: ${replaying}` : branch,
      rebaseBranch: branch,
      step,
      total
    }
  }

  const message = cleanMessage(await readTrimmed(join(dir, 'MERGE_MSG')))

  const mergeHead = await readTrimmed(join(dir, 'MERGE_HEAD'))
  if (mergeHead) {
    return {
      kind: 'merge',
      currentLabel: await currentBranch(repoPath),
      incomingLabel: mergedBranchesLabel(message) ?? (await branchAt(repoPath, mergeHead.split('\n')[0])),
      message
    }
  }

  for (const [file, kind] of [
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert']
  ] as const) {
    if (!(await exists(join(dir, file)))) continue
    const commit = await describeCommit(repoPath, file)
    return {
      kind,
      currentLabel: await currentBranch(repoPath),
      incomingLabel: kind === 'revert' ? `revert of ${commit}` : commit,
      message
    }
  }

  return null
}

export async function hasUnmergedPaths(repoPath: string): Promise<boolean> {
  const out = await runGit(repoPath, ['diff', '--name-only', '--diff-filter=U']).catch(() => '')
  return out.trim().length > 0
}

/**
 * Runs a git command that may stop on conflicts. Stopping on conflicts is a
 * normal outcome here, not an error: the app shows the conflict UI instead.
 */
export async function runMayConflict(
  repoPath: string,
  args: string[],
  env?: Record<string, string>
): Promise<ConflictableResult> {
  try {
    await runGit(repoPath, args, env)
    return { conflicts: false }
  } catch (err) {
    if ((await getOperationState(repoPath)) && (await hasUnmergedPaths(repoPath))) {
      return { conflicts: true }
    }
    throw err
  }
}

// Keep git from opening an editor for commit messages it would ask about.
const NO_EDITOR = { GIT_EDITOR: 'true' }

/** Where an interactive rebase started from the app keeps its todo, messages and editor script. */
export async function interactiveRebaseDir(repoPath: string): Promise<string> {
  return join(await gitDir(repoPath), 'sillygit-rebase')
}

/**
 * The editor for a rebase: during an interactive rebase started from the app,
 * its script, which answers with the messages the user typed for rewords and
 * squashes (see rebase.ts); otherwise none.
 */
export async function rebaseEditorEnv(repoPath: string): Promise<Record<string, string>> {
  const script = join(await interactiveRebaseDir(repoPath), 'editor.sh')
  if (!(await exists(script))) return NO_EDITOR
  return { GIT_EDITOR: `sh '${script.replace(/\\/g, '/').replace(/'/g, `'\\''`)}'` }
}

/** Removes an interactive rebase's scratch files once no rebase is left in progress. */
export async function cleanUpInteractiveRebase(repoPath: string): Promise<void> {
  if ((await getOperationState(repoPath))?.kind === 'rebase') return
  await fsp.rm(await interactiveRebaseDir(repoPath), { recursive: true, force: true }).catch(() => {})
}

/** Runs a rebase command with the right editor, and tidies up when the rebase is over. */
async function runRebase(repoPath: string, args: string[]): Promise<ConflictableResult> {
  try {
    return await runMayConflict(repoPath, args, await rebaseEditorEnv(repoPath))
  } finally {
    await cleanUpInteractiveRebase(repoPath)
  }
}

export async function mergeBranch(repoPath: string, branch: string): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['merge', '--no-edit', branch], NO_EDITOR)
}

export async function rebaseOnto(repoPath: string, branch: string): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['rebase', branch], NO_EDITOR)
}

async function requireState(repoPath: string): Promise<OperationState> {
  const state = await getOperationState(repoPath)
  if (!state) throw new GitError('No merge, rebase, cherry-pick or revert is in progress.')
  return state
}

/**
 * Finishes the stopped operation once its conflicts are resolved: commits the
 * merge (or cherry-pick / revert) with `message`, or continues the rebase,
 * which may stop again on the next commit's conflicts.
 */
export async function continueOperation(repoPath: string, message?: string): Promise<ConflictableResult> {
  const state = await requireState(repoPath)
  if (await hasUnmergedPaths(repoPath)) {
    throw new GitError('Resolve every conflicted file before continuing.')
  }
  if (state.kind === 'rebase') return runRebase(repoPath, ['rebase', '--continue'])
  // A plain commit concludes a merge, cherry-pick or revert, and keeps the
  // picked commit's author.
  const args = message?.trim() ? ['commit', '-m', message.trim()] : ['commit', '--no-edit']
  await runGit(repoPath, args, NO_EDITOR)
  return { conflicts: false }
}

export async function abortOperation(repoPath: string): Promise<void> {
  const state = await requireState(repoPath)
  await runGit(repoPath, [state.kind, '--abort'])
  if (state.kind === 'rebase') await cleanUpInteractiveRebase(repoPath)
}

/** Skips the commit being applied (rebase, cherry-pick or revert). */
export async function skipOperation(repoPath: string): Promise<ConflictableResult> {
  const state = await requireState(repoPath)
  if (state.kind === 'merge') throw new GitError('A merge cannot skip; abort it instead.')
  if (state.kind === 'rebase') return runRebase(repoPath, ['rebase', '--skip'])
  return runMayConflict(repoPath, [state.kind, '--skip'], NO_EDITOR)
}
