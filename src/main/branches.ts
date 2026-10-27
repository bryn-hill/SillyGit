import { execFile } from 'child_process'
import { promisify } from 'util'
import type { OpenPullRequest, RepoRemote } from '../shared/types'
import { remoteEnv, runGit } from './gitExec'
import * as github from './github'
import { githubAccess } from './hosting'

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

/** The repo's remotes with their web URLs. Plain git, so it's quick enough for every refresh. */
export async function listRepoRemotes(repoPath: string): Promise<RepoRemote[]> {
  const out = await runGit(repoPath, ['remote', '-v'])
  const remotes = new Map<string, RepoRemote>()
  for (const line of out.split('\n')) {
    const [name, url] = line.split(/\s+/)
    if (name && url && !remotes.has(name)) remotes.set(name, { name, webUrl: remoteWebUrl(url) })
  }
  return [...remotes.values()]
}

/**
 * The repo's open pull requests, from the GitHub API when an account is
 * signed in for the remote's host, otherwise from the gh CLI. This is a
 * network call that takes a second or two, so the app runs it in the
 * background and the branch menu reads the cached result. Empty when
 * neither works.
 */
export async function listOpenPullRequests(repoPath: string): Promise<OpenPullRequest[]> {
  try {
    const access = await githubAccess(repoPath)
    if (access) return await github.listOpenPullRequests(access.creds, access.repo)
  } catch {
    // Fall back to gh.
  }
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,url,headRefName'],
      { cwd: repoPath, timeout: 15000 }
    )
    return JSON.parse(stdout) as OpenPullRequest[]
  } catch {
    return []
  }
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
  await runGit(repoPath, ['push', target.remote, '--delete', target.branch], await remoteEnv())
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
