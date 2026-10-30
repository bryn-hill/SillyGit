import { randomUUID } from 'crypto'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fixupMessage, linesToBlame, pickTarget, type AbsorbCommit, type AbsorbPlan } from '../shared/absorb'
import { buildPatchForUnits, parseCommitDiff } from '../shared/diffSplit'
import type { FixupResult } from '../shared/types'
import { getOperationState, rebaseEditorEnv, runMayConflict } from './conflicts'
import { GitError, runGit } from './gitExec'

// Folding staged changes into earlier commits: each becomes a "fixup!" commit
// and an autosquash rebase moves it into place, the way `git commit --fixup`
// plus `git rebase -i --autosquash` would by hand. The working tree is never
// touched until that rebase, which autostashes whatever else is uncommitted.

const FS = '\x1f'
/** Most commits absorb looks back through when the branch has no remote to stop at. */
const MAX_CANDIDATES = 50

async function currentBranch(repoPath: string): Promise<string> {
  const branch = (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim()
  if (!branch) throw new GitError('Check out a branch first: this rewrites the branch you are on.')
  return branch
}

async function stagedDiff(repoPath: string): Promise<string> {
  return runGit(repoPath, ['diff', '--cached', '--no-color', '--no-ext-diff'])
}

async function checkReady(repoPath: string): Promise<{ branch: string; head: string }> {
  if (await getOperationState(repoPath)) throw new GitError('Finish or abort the operation in progress first.')
  const branch = await currentBranch(repoPath)
  const head = (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim()
  return { branch, head }
}

/** The commit to rebase from so that `oldest` is replayed: its parent, or the root. */
async function rebaseBase(repoPath: string, oldest: string): Promise<string[]> {
  const parent = (await runGit(repoPath, ['rev-parse', '-q', '--verify', `${oldest}^`]).catch(() => '')).trim()
  return parent ? [parent] : ['--root']
}

async function refuseMerges(repoPath: string, oldest: string): Promise<void> {
  const merges = Number((await runGit(repoPath, ['rev-list', '--merges', '--count', `${oldest}..HEAD`])).trim())
  if (merges > 0) throw new GitError('There is a merge after that commit, so it can’t be rewritten in a straight line.')
}

/** Whether a remote branch has `hash`, so rewriting it needs a force push. */
export async function isPushed(repoPath: string, hash: string): Promise<boolean> {
  const out = await runGit(repoPath, ['branch', '-r', '--contains', hash]).catch(() => '')
  return out.trim().length > 0
}

/** Squashes the fixup commits on HEAD into their targets, oldest target `oldest`. */
export async function autosquash(repoPath: string, oldest: string): Promise<{ conflicts: boolean }> {
  return runMayConflict(repoPath, ['rebase', '-i', '--autosquash', '--autostash', ...(await rebaseBase(repoPath, oldest))], {
    ...(await rebaseEditorEnv(repoPath)),
    GIT_SEQUENCE_EDITOR: 'true'
  })
}

/** Folds everything staged into `target`, which must be in the current branch's history. */
export async function fixupInto(repoPath: string, target: string): Promise<FixupResult> {
  const { branch } = await checkReady(repoPath)
  const hash = (await runGit(repoPath, ['rev-parse', '-q', '--verify', `${target}^{commit}`]).catch(() => '')).trim()
  if (!hash) throw new GitError(`"${target}" is not a commit.`)
  const inHistory = await runGit(repoPath, ['merge-base', '--is-ancestor', hash, 'HEAD'])
    .then(() => true)
    .catch(() => false)
  if (!inHistory) throw new GitError(`That commit is not part of ${branch}'s history.`)
  if (!(await stagedDiff(repoPath)).trim()) throw new GitError('Stage the changes to fold in first.')
  await refuseMerges(repoPath, hash)

  const pushed = await isPushed(repoPath, hash)
  await runGit(repoPath, ['commit', '-q', '--no-verify', '-m', fixupMessage(hash)])
  const result = await autosquash(repoPath, hash)
  return { ...result, pushed }
}

/** The branch's commits a staged hunk may go into, newest first, stopping at the first merge. */
async function absorbCandidates(repoPath: string): Promise<AbsorbCommit[]> {
  const out = await runGit(repoPath, [
    'log',
    `--max-count=${MAX_CANDIDATES}`,
    `--format=%H${FS}%h${FS}%P${FS}%s`,
    'HEAD',
    '--not',
    '--remotes'
  ])
  const commits: AbsorbCommit[] = []
  for (const row of out.split('\n').filter(Boolean)) {
    const [hash, shortHash, parents, subject] = row.split(FS)
    if (parents.split(' ').length > 1) break
    commits.push({ hash, shortHash, subject })
  }
  return commits
}

/** The commits that last changed `lines` of `path` at HEAD. */
async function blameLines(repoPath: string, path: string, lines: number[]): Promise<Set<string>> {
  const args = ['blame', '--porcelain', ...lines.flatMap((n) => ['-L', `${n},${n}`]), 'HEAD', '--', path]
  const out = await runGit(repoPath, args).catch(() => '')
  const hashes = new Set<string>()
  for (const line of out.split('\n')) {
    const m = /^([0-9a-f]{40}) \d+ \d+/.exec(line)
    if (m) hashes.add(m[1])
  }
  return hashes
}

/** Works out which commit each staged hunk belongs in. */
export async function planAbsorb(repoPath: string): Promise<AbsorbPlan> {
  const { branch, head } = await checkReady(repoPath)
  const diffText = await stagedDiff(repoPath)
  if (!diffText.trim()) throw new GitError('Nothing is staged. Stage the fixes you want absorbed first.')
  const candidates = await absorbCandidates(repoPath)
  const candidateSet = new Set(candidates.map((c) => c.hash))
  const { units } = parseCommitDiff(diffText)

  const hunks = await Promise.all(
    units.map(async (unit) => {
      const lines = unit.body.split('\n')
      const base = {
        unitId: unit.id,
        file: unit.file,
        header: unit.hunkHeader ?? '',
        added: lines.filter((l) => l.startsWith('+')).length,
        removed: lines.filter((l) => l.startsWith('-')).length
      }
      if (unit.hunkHeader == null) return { ...base, target: null, reason: 'Binary or mode change' }
      const blameAt = linesToBlame(unit.hunkHeader, unit.body)
      if (blameAt.length === 0) return { ...base, target: null, reason: 'New file' }
      const blamed = await blameLines(repoPath, unit.file, blameAt)
      const target = pickTarget(blamed, candidates)
      if (target) return { ...base, target }
      const reason = [...blamed].some((h) => !candidateSet.has(h)) ? 'Last changed in a pushed commit' : 'No commit found'
      return { ...base, target: null, reason }
    })
  )
  return { branch, head, diffText, candidates, hunks }
}

/**
 * Commits each staged hunk as a fixup of the commit `assignments` gives it
 * (unit id to hash; others stay staged) and squashes them in. Refuses if HEAD
 * or the staged changes moved since `plan`.
 */
export async function absorb(
  repoPath: string,
  planHead: string,
  planDiff: string,
  assignments: Record<string, string>
): Promise<FixupResult> {
  const { head } = await checkReady(repoPath)
  if (head !== planHead || (await stagedDiff(repoPath)) !== planDiff) {
    throw new GitError('The staged changes or the branch moved since this was worked out. Open Absorb again.')
  }
  const { fileBlocks, units } = parseCommitDiff(planDiff)
  const byTarget = new Map<string, Set<string>>()
  const leftOver = new Set<string>()
  for (const unit of units) {
    const target = assignments[unit.id]
    if (target) byTarget.set(target, (byTarget.get(target) ?? new Set()).add(unit.id))
    else leftOver.add(unit.id)
  }
  if (byTarget.size === 0) throw new GitError('No change has a commit to go into.')

  const targets = [...byTarget.keys()]
  for (const target of targets) {
    const ok = await runGit(repoPath, ['merge-base', '--is-ancestor', target, 'HEAD'])
      .then(() => true)
      .catch(() => false)
    if (!ok) throw new GitError(`${target.slice(0, 7)} is not part of this branch's history.`)
  }
  // On a straight line of commits the targets' common ancestor is the oldest of them, where the rebase starts.
  const oldest = (await runGit(repoPath, ['merge-base', '--octopus', ...targets])).trim()
  if (!byTarget.has(oldest)) throw new GitError('Those commits are not on one line of history.')
  await refuseMerges(repoPath, oldest)
  const pushed = (await Promise.all([...byTarget.keys()].map((h) => isPushed(repoPath, h)))).some(Boolean)

  // Build the fixup commits in the index alone, so the working tree is untouched if anything fails.
  const savedIndex = (await runGit(repoPath, ['write-tree'])).trim()
  const apply = async (ids: Set<string>): Promise<void> => {
    const patchFile = join(tmpdir(), `sillygit-absorb-${randomUUID()}.patch`)
    await fsp.writeFile(patchFile, buildPatchForUnits(fileBlocks, ids), 'utf-8')
    try {
      await runGit(repoPath, ['apply', '--cached', '--whitespace=nowarn', patchFile])
    } finally {
      await fsp.unlink(patchFile).catch(() => {})
    }
  }
  try {
    await runGit(repoPath, ['reset', '-q'])
    for (const [target, ids] of byTarget) {
      await apply(ids)
      await runGit(repoPath, ['commit', '-q', '--no-verify', '-m', fixupMessage(target)])
    }
    if (leftOver.size > 0) await apply(leftOver)
  } catch (err) {
    await runGit(repoPath, ['reset', '-q', '--soft', head]).catch(() => {})
    await runGit(repoPath, ['read-tree', savedIndex]).catch(() => {})
    throw err
  }
  const result = await autosquash(repoPath, oldest)
  return { ...result, pushed }
}
