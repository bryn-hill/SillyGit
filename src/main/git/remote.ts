import type { ConflictableResult, PullMode } from '../../shared/types'
import { runMayConflict } from '../conflicts'
import { remoteEnv, runGit } from '../gitExec'

// Fetching, pushing and pulling.

// A fetch asked for while one is still running (the Fetch button during an
// auto-fetch, say) shares it rather than queueing a second straight after.
const fetching = new Map<string, Promise<void>>()

export function fetchAll(repoPath: string): Promise<void> {
  const running = fetching.get(repoPath)
  if (running) return running
  const fetch = (async () => {
    await runGit(repoPath, ['fetch', '--all', '--prune', '--quiet'], await remoteEnv())
  })().finally(() => fetching.delete(repoPath))
  fetching.set(repoPath, fetch)
  return fetch
}

/** Pushes the current branch, publishing it with `-u` when it has no upstream yet. */
export async function push(repoPath: string): Promise<void> {
  const env = await remoteEnv()
  const upstream = await runGit(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => null)
  if (upstream?.trim()) {
    await runGit(repoPath, ['push'], env)
    return
  }
  const remotes = (await runGit(repoPath, ['remote'])).split('\n').map((r) => r.trim()).filter(Boolean)
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  if (!remote) throw new Error('This repository has no remote to push to.')
  await runGit(repoPath, ['push', '-u', remote, 'HEAD'], env)
}

const PULL_ARGS: Record<PullMode, string[]> = {
  ff: ['pull', '--no-rebase', '--no-edit'],
  'ff-only': ['pull', '--ff-only'],
  rebase: ['pull', '--rebase']
}

export async function pull(repoPath: string, mode: PullMode = 'ff'): Promise<ConflictableResult> {
  return runMayConflict(repoPath, PULL_ARGS[mode], { ...(await remoteEnv()), GIT_EDITOR: 'true' })
}
