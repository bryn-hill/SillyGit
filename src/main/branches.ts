import { execFile } from 'child_process'
import { promisify } from 'util'
import type { BranchRemoteInfo } from '../shared/types'
import { runGit } from './gitExec'

const execFileAsync = promisify(execFile)

async function listRemotes(repoPath: string): Promise<string[]> {
  const out = await runGit(repoPath, ['remote'])
  return out.split('\n').map((l) => l.trim()).filter(Boolean)
}

/** Splits "origin/feature/x" into its remote and branch, using the repo's real remote names. */
async function splitRemoteBranch(
  repoPath: string,
  name: string
): Promise<{ remote: string; branch: string } | null> {
  const remotes = await listRemotes(repoPath)
  // Longest first, so a remote called "a/b" wins over "a".
  const remote = remotes.sort((a, b) => b.length - a.length).find((r) => name.startsWith(`${r}/`))
  return remote ? { remote, branch: name.slice(remote.length + 1) } : null
}

async function localBranchExists(repoPath: string, name: string): Promise<boolean> {
  try {
    await runGit(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

/**
 * Turns a remote URL into the browsable https URL of its repository, e.g.
 * git@github.com:owner/repo.git -> https://github.com/owner/repo.
 */
export function remoteWebUrl(url: string): string | null {
  const trimmed = url.trim().replace(/\/$/, '').replace(/\.git$/, '')
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(trimmed)
  if (scp) return `https://${scp[1]}/${scp[2]}`
  const parsed = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(trimmed)
  if (parsed) return `https://${parsed[1]}/${parsed[2]}`
  return null
}

async function findPullRequest(
  repoPath: string,
  branch: string
): Promise<{ number: number; url: string } | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '--head', branch, '--state', 'open', '--limit', '1', '--json', 'number,url'],
      { cwd: repoPath, timeout: 10000 }
    )
    const prs = JSON.parse(stdout) as { number: number; url: string }[]
    return prs[0] ?? null
  } catch {
    // gh missing, not logged in, or not a GitHub repo: just leave the PR items out.
    return null
  }
}

/** Looks up where `name` lives on its remote, and its open pull request if any. */
export async function getBranchRemoteInfo(
  repoPath: string,
  name: string,
  isRemote: boolean
): Promise<BranchRemoteInfo> {
  let target: { remote: string; branch: string } | null = null
  if (isRemote) {
    target = await splitRemoteBranch(repoPath, name)
  } else {
    const upstream = (
      await runGit(repoPath, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${name}`]).catch(() => '')
    ).trim()
    if (upstream) target = await splitRemoteBranch(repoPath, upstream)
  }

  let remote = target?.remote ?? null
  if (!remote) {
    const remotes = await listRemotes(repoPath).catch((): string[] => [])
    remote = remotes.includes('origin') ? 'origin' : (remotes[0] ?? null)
  }

  let webUrl: string | null = null
  if (remote) {
    const url = await runGit(repoPath, ['remote', 'get-url', remote]).catch(() => '')
    webUrl = remoteWebUrl(url)
  }

  const remoteBranch = target?.branch ?? null
  const pullRequest = remoteBranch && webUrl ? await findPullRequest(repoPath, remoteBranch) : null
  return { remote, webUrl, remoteBranch, pullRequest }
}

/**
 * Checks out a remote branch the way GitKraken does: switch to the local
 * branch of the same name if there is one, otherwise create it tracking the remote.
 */
export async function checkoutRemoteBranch(repoPath: string, name: string): Promise<void> {
  const target = await splitRemoteBranch(repoPath, name)
  if (!target) {
    await runGit(repoPath, ['checkout', name])
    return
  }
  if (await localBranchExists(repoPath, target.branch)) {
    await runGit(repoPath, ['checkout', target.branch])
  } else {
    await runGit(repoPath, ['checkout', '--track', '-b', target.branch, name])
  }
}

/** Deletes a local branch; `force` deletes it even when it isn't merged. */
export async function deleteBranch(repoPath: string, name: string, force: boolean): Promise<void> {
  await runGit(repoPath, ['branch', force ? '-D' : '-d', name])
}

/** Deletes a branch from its remote, e.g. "origin/feature" runs `git push origin --delete feature`. */
export async function deleteRemoteBranch(repoPath: string, name: string): Promise<void> {
  const target = await splitRemoteBranch(repoPath, name)
  if (!target) throw new Error(`"${name}" isn't on a known remote`)
  await runGit(repoPath, ['push', target.remote, '--delete', target.branch])
}

export async function renameBranch(repoPath: string, from: string, to: string): Promise<void> {
  await runGit(repoPath, ['branch', '-m', from, to])
}

/**
 * Adds a worktree at `path`. A local branch is checked out there directly; a
 * remote branch gets a local tracking branch (reusing one that already
 * exists); anything else is checked out detached.
 */
export async function addWorktree(
  repoPath: string,
  path: string,
  ref: string,
  kind: 'local' | 'remote' | 'commit'
): Promise<void> {
  if (kind === 'local') {
    await runGit(repoPath, ['worktree', 'add', path, ref])
    return
  }
  if (kind === 'remote') {
    const target = await splitRemoteBranch(repoPath, ref)
    if (target && (await localBranchExists(repoPath, target.branch))) {
      await runGit(repoPath, ['worktree', 'add', path, target.branch])
    } else if (target) {
      await runGit(repoPath, ['worktree', 'add', '--track', '-b', target.branch, path, ref])
    } else {
      await runGit(repoPath, ['worktree', 'add', '--detach', path, ref])
    }
    return
  }
  await runGit(repoPath, ['worktree', 'add', '--detach', path, ref])
}
