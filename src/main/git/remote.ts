import type { ConflictableResult, PullMode } from '../../shared/types'
import { defaultPushTarget, pushRejection, type PushOptions, type PushResult } from '../../shared/push'
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

/**
 * Pushes the current branch: to its upstream, or to `options.remote` and
 * `options.branch` when given, publishing it with `-u` when it has no upstream
 * yet. A push git refuses because the remote branch has commits this one
 * doesn't (after an amend, rebase, fixup or absorb, or someone else pushing)
 * comes back as `rejected` rather than an error, so the app can offer a force
 * push. `options.force` uses `--force-with-lease --force-if-includes`: it
 * only overwrites what the last fetch saw and this branch has since built on.
 */
export async function push(repoPath: string, options: PushOptions = {}): Promise<PushResult> {
  const env = await remoteEnv()
  const branch = (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim()
  if (!branch) throw new Error('Check out a branch to push it.')
  const upstream = (await runGit(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => '')).trim()
  const remotes = (await runGit(repoPath, ['remote'])).split('\n').map((r) => r.trim()).filter(Boolean)
  const fallback = defaultPushTarget(branch, upstream, remotes)
  const remote = options.remote ?? fallback?.remote
  if (!remote) throw new Error('This repository has no remote to push to.')
  const target = options.branch?.trim() || (remote === fallback?.remote ? fallback.branch : branch)
  const args = ['push']
  if (options.force) args.push('--force-with-lease', '--force-if-includes')
  if (!upstream) args.push('-u')
  args.push(remote, `HEAD:refs/heads/${target}`)
  try {
    await runGit(repoPath, args, env)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const why = pushRejection(message)
    if (why === 'stale') {
      throw new Error(
        `Someone pushed to ${remote}/${target} since your branch last caught up with it, so the force push was stopped to keep their commits. Fetch, look at what changed and rebase onto it, then push again.`
      )
    }
    if (why === 'diverged' && !options.force) return { rejected: true, remote, branch: target }
    throw err
  }
  return { rejected: false, remote, branch: target }
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
