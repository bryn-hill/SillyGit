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

// Managing the remotes themselves, from the side bar's Remotes list.

/** Fetches one remote, pruning its deleted branches. */
export async function fetchRemote(repoPath: string, name: string): Promise<void> {
  await runGit(repoPath, ['fetch', '--prune', '--quiet', name], await remoteEnv())
}

export async function addRemote(repoPath: string, name: string, url: string): Promise<void> {
  await runGit(repoPath, ['remote', 'add', '--', name.trim(), url.trim()])
}

/** Renames a remote; git moves its remote branches and fixes up tracking branches too. */
export async function renameRemote(repoPath: string, name: string, newName: string): Promise<void> {
  await runGit(repoPath, ['remote', 'rename', '--', name, newName.trim()])
}

/** Removes a remote and its remote branches. Local branches that tracked it stop tracking anything. */
export async function removeRemote(repoPath: string, name: string): Promise<void> {
  await runGit(repoPath, ['remote', 'remove', '--', name])
}

/** Changes a remote's fetch URL, or its push URL alone when `push` is set. */
export async function setRemoteUrl(repoPath: string, name: string, url: string, push = false): Promise<void> {
  await runGit(repoPath, ['remote', 'set-url', ...(push ? ['--push'] : []), '--', name, url.trim()])
}
