import type { StashEntry } from '../../shared/types'
import { runGit } from '../gitExec'
import { US } from './history'

// Stashes.

export async function stash(repoPath: string, message?: string): Promise<void> {
  const args = ['stash', 'push', '--include-untracked']
  await runGit(repoPath, message ? [...args, '-m', message] : args)
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
