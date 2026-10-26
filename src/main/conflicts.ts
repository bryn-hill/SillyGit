import { execFile } from 'child_process'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ConflictFileContent, ConflictableResult, OperationState } from '../shared/types'
import { GitError, runGit } from './gitExec'

// Merge, rebase, cherry-pick and revert can all stop part way with conflicts.
// This module reads that in-progress state from the git directory, and drives
// the resolver: reading each side of a conflicted file, saving a resolution,
// and aborting, continuing or skipping the operation.

async function gitDir(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', '--absolute-git-dir'])).trim()
}

async function exists(path: string): Promise<boolean> {
  return fsp
    .access(path)
    .then(() => true)
    .catch(() => false)
}

async function readTrimmed(path: string): Promise<string | null> {
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
    const fromMessage = message?.match(/^Merge (?:remote-tracking )?branch '([^']+)'/)?.[1]
    return {
      kind: 'merge',
      currentLabel: await currentBranch(repoPath),
      incomingLabel: fromMessage ?? (await branchAt(repoPath, mergeHead.split('\n')[0])),
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

async function hasUnmergedPaths(repoPath: string): Promise<boolean> {
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
  if (state.kind === 'rebase') {
    return runMayConflict(repoPath, ['rebase', '--continue'], NO_EDITOR)
  }
  // A plain commit concludes a merge, cherry-pick or revert, and keeps the
  // picked commit's author.
  const args = message?.trim() ? ['commit', '-m', message.trim()] : ['commit', '--no-edit']
  await runGit(repoPath, args, NO_EDITOR)
  return { conflicts: false }
}

export async function abortOperation(repoPath: string): Promise<void> {
  const state = await requireState(repoPath)
  await runGit(repoPath, [state.kind, '--abort'])
}

/** Skips the commit being applied (rebase, cherry-pick or revert). */
export async function skipOperation(repoPath: string): Promise<ConflictableResult> {
  const state = await requireState(repoPath)
  if (state.kind === 'merge') throw new GitError('A merge cannot skip; abort it instead.')
  return runMayConflict(repoPath, [state.kind, '--skip'], NO_EDITOR)
}

/** Blob ids of the index stages of a conflicted path: 1 base, 2 current (ours), 3 incoming (theirs). */
async function conflictStages(repoPath: string, path: string): Promise<Map<number, string>> {
  const out = await runGit(repoPath, ['ls-files', '-u', '-z', '--', path])
  const stages = new Map<number, string>()
  for (const entry of out.split('\0')) {
    const m = entry.match(/^\d+ ([0-9a-f]+) (\d)\t/)
    if (m) stages.set(Number(m[2]), m[1])
  }
  return stages
}

/** Runs `git merge-file`, whose exit code is the number of conflicts, not an error. */
function mergeFile(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['merge-file', ...args], { cwd: repoPath, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      const code = err ? (err as { code?: number | string }).code : 0
      if (typeof code === 'number' && code >= 0 && code < 128) resolve(stdout)
      else reject(new GitError(stderr?.trim() || String(err)))
    })
  })
}

export async function getConflictFile(repoPath: string, path: string): Promise<ConflictFileContent> {
  const state = await getOperationState(repoPath)
  const currentLabel = state?.currentLabel ?? 'Current'
  const incomingLabel = state?.incomingLabel ?? 'Incoming'
  const base: ConflictFileContent = { path, kind: 'text', marked: '', currentLabel, incomingLabel }

  const stages = await conflictStages(repoPath, path)
  if (stages.size === 0) throw new GitError(`"${path}" has no conflicts.`)
  if (!stages.has(2)) return { ...base, kind: 'deleted-current' }
  if (!stages.has(3)) return { ...base, kind: 'deleted-incoming' }

  const blob = (stage: number): Promise<string> =>
    stages.has(stage) ? runGit(repoPath, ['cat-file', 'blob', stages.get(stage)!]) : Promise.resolve('')
  const [ancestor, ours, theirs] = await Promise.all([blob(1), blob(2), blob(3)])
  if ([ancestor, ours, theirs].some((s) => s.includes('\0'))) return { ...base, kind: 'binary' }

  const dir = await fsp.mkdtemp(join(tmpdir(), 'sillygit-merge-'))
  try {
    const files = { ours: join(dir, 'ours'), base: join(dir, 'base'), theirs: join(dir, 'theirs') }
    await Promise.all([
      fsp.writeFile(files.ours, ours),
      fsp.writeFile(files.base, ancestor),
      fsp.writeFile(files.theirs, theirs)
    ])
    const marked = await mergeFile(repoPath, [
      '-p',
      '--diff3',
      '-L',
      currentLabel,
      '-L',
      'base',
      '-L',
      incomingLabel,
      files.ours,
      files.base,
      files.theirs
    ])
    return { ...base, marked }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Writes the resolved content and, unless `stage` is false (content that
 * still has conflict markers), stages it, marking the file resolved.
 */
export async function saveResolution(repoPath: string, path: string, content: string, stage = true): Promise<void> {
  await fsp.writeFile(join(repoPath, path), content)
  if (stage) await runGit(repoPath, ['add', '--', path])
}

/**
 * Resolves a file by taking one version of it whole: the current or incoming
 * side, or the common ancestor. Taking a version that doesn't exist (the side
 * that deleted the file) deletes it.
 */
export async function takeSide(
  repoPath: string,
  path: string,
  side: 'current' | 'incoming' | 'base'
): Promise<void> {
  const stages = await conflictStages(repoPath, path)
  const stage = side === 'base' ? 1 : side === 'current' ? 2 : 3
  if (stages.size > 0 && !stages.has(stage)) {
    await runGit(repoPath, ['rm', '-q', '--', path])
    return
  }
  if (side === 'base') {
    await fsp.writeFile(join(repoPath, path), await runGit(repoPath, ['cat-file', 'blob', stages.get(1)!]))
  } else {
    await runGit(repoPath, ['checkout', side === 'current' ? '--ours' : '--theirs', '--', path])
  }
  await runGit(repoPath, ['add', '--', path])
}

/** Deletes a conflicted file and marks it resolved that way. */
export async function deleteConflictedFile(repoPath: string, path: string): Promise<void> {
  await runGit(repoPath, ['rm', '-q', '--force', '--', path])
}

/** Marks files resolved as they are in the working tree (a missing file is resolved as deleted). */
export async function markResolved(repoPath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await runGit(repoPath, ['add', '-A', '--', ...paths])
}
