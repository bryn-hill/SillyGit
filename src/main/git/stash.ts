import type { StashEntry, StashFile, StashPushOptions } from '../../shared/types'
import { runGit } from '../gitExec'
import { parseNameStatus, US } from './history'

// Stashes.

export async function stash(repoPath: string, message?: string): Promise<void> {
  await stashPush(repoPath, { message })
}

/**
 * Stashes every change, or only `paths`, untracked files included. With
 * `keepIndex` the staged changes stay in the working tree too.
 */
export async function stashPush(repoPath: string, options: StashPushOptions): Promise<void> {
  const args = ['stash', 'push', '--include-untracked']
  if (options.keepIndex) args.push('--keep-index')
  if (options.message) args.push('-m', options.message)
  if (options.paths && options.paths.length > 0) args.push('--', ...options.paths)
  await runGit(repoPath, args)
}

/** Pops `ref` (e.g. "stash@{2}"), or the newest stash when it's left out. */
export async function stashPop(repoPath: string, ref?: string): Promise<void> {
  await runGit(repoPath, ref ? ['stash', 'pop', ref] : ['stash', 'pop'])
}

export async function stashApply(repoPath: string, ref: string): Promise<void> {
  await runGit(repoPath, ['stash', 'apply', ref])
}

export async function stashDrop(repoPath: string, ref: string): Promise<void> {
  await runGit(repoPath, ['stash', 'drop', ref])
}

/**
 * The files a stash (by commit hash) holds: tracked changes against the commit
 * it was made on, then the untracked files git keeps in its third parent.
 */
export async function stashFiles(repoPath: string, hash: string): Promise<StashFile[]> {
  const [tracked, untracked] = await Promise.all([
    runGit(repoPath, ['diff', '--no-color', '--name-status', '-M', `${hash}^1`, hash]),
    runGit(repoPath, ['ls-tree', '-r', '--name-only', '-z', `${hash}^3`]).catch(() => '')
  ])
  return [
    ...parseNameStatus(tracked.split('\n')).map((f) => ({ ...f, status: f.status[0], untracked: false })),
    ...untracked
      .split('\0')
      .filter(Boolean)
      .map((path) => ({ path, status: 'A', untracked: true }))
  ]
}

export async function listStashes(repoPath: string): Promise<StashEntry[]> {
  let out: string
  try {
    out = await runGit(repoPath, ['stash', 'list', `--format=%gd${US}%H${US}%gs${US}%cI`])
  } catch {
    return []
  }
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [ref, hash, subject, date] = line.split(US)
      return { ref, hash, message: subject, date }
    })
}
