import type { BranchInfo } from '../../shared/types'
import { parseTrack } from '../../shared/branchStatus'
import { runGit } from '../gitExec'

// Branches and tags, checking out, and moving HEAD with reset.

export async function listBranches(repoPath: string): Promise<BranchInfo[]> {
  const out = await runGit(repoPath, [
    'branch',
    '--list',
    '--format=%(HEAD)%09%(refname:short)%09%(objectname)%09%(upstream:short)%09%(upstream:track,nobracket)%09%(committerdate:unix)'
  ])
  const local = out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line): BranchInfo => {
      const [head, name, hash, upstream, track, date] = line.split('\t')
      const branch: BranchInfo = { name, current: head === '*', remote: false, hash, upstream: upstream || undefined }
      if (upstream) {
        const { ahead, behind, gone } = parseTrack(track ?? '')
        Object.assign(branch, { ahead, behind, upstreamGone: gone })
      }
      if (date) branch.lastCommitAt = Number(date)
      return branch
    })

  const remoteOut = await runGit(repoPath, [
    'branch',
    '--list',
    '--remotes',
    '--format=%(refname:short)%09%(objectname)%09%(symref)%09%(committerdate:unix)'
  ])
  const remote = remoteOut
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => line.split('\t'))
    // Skip symbolic refs such as origin/HEAD.
    .filter(([name, , symref]) => !symref && name.includes('/'))
    .map(([name, hash, , date]) => ({ name, current: false, remote: true, hash, lastCommitAt: date ? Number(date) : undefined }))

  return [...local, ...remote]
}

export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  await runGit(repoPath, ['checkout', branch])
}

export async function createBranch(repoPath: string, branch: string): Promise<void> {
  await runGit(repoPath, ['checkout', '-b', branch])
}

export async function resetTo(
  repoPath: string,
  hash: string,
  mode: 'soft' | 'mixed' | 'hard'
): Promise<void> {
  await runGit(repoPath, ['reset', `--${mode}`, hash])
}

export async function createBranchAt(
  repoPath: string,
  branch: string,
  startPoint: string,
  checkout = true
): Promise<void> {
  if (checkout) {
    await runGit(repoPath, ['checkout', '-b', branch, startPoint])
  } else {
    await runGit(repoPath, ['branch', branch, startPoint])
  }
}

export async function createTag(repoPath: string, name: string, hash: string): Promise<void> {
  await runGit(repoPath, ['tag', name, hash])
}

export async function createAnnotatedTag(
  repoPath: string,
  name: string,
  message: string,
  hash: string
): Promise<void> {
  await runGit(repoPath, ['tag', '-a', name, '-m', message, hash])
}
