import { execFile } from 'child_process'
import { promisify } from 'util'
import type { OpenPullRequest, RepoRemote } from '../shared/types'
import type { CleanupCandidate, DeletedBranch } from '../shared/branchCleanup'
import { GitError, remoteEnv, runGit } from './gitExec'
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

/**
 * Pulls a local branch without checking it out: fetches its upstream straight
 * into it, which git only allows as a fast-forward. Resolves to whether the
 * branch moved. Branches that have diverged from their upstream need a merge
 * or rebase, so they have to be checked out first.
 */
export async function pullBranch(repoPath: string, name: string): Promise<{ updated: boolean }> {
  const ref = `refs/heads/${name}`
  const out = await runGit(repoPath, [
    'for-each-ref',
    '--format=%(upstream:remotename)%09%(upstream:remoteref)%09%(upstream:short)',
    ref
  ])
  const [remote, remoteRef, upstream] = out.trim().split('\t')
  if (!remote || !remoteRef) throw new GitError(`${name} doesn't track a remote branch, so there's nothing to pull.`)
  const before = (await runGit(repoPath, ['rev-parse', ref])).trim()
  try {
    await runGit(repoPath, ['fetch', '--no-write-fetch-head', remote, `${remoteRef}:${ref}`], await remoteEnv())
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/non-fast-forward|\(rejected\)|\[rejected\]/i.test(message)) {
      throw new GitError(
        `Can't pull ${name} without checking it out: it has commits that aren't on ${upstream}. Check it out and pull to merge or rebase them.`
      )
    }
    const worktree = /checked out at '([^']+)'/.exec(message)
    if (worktree) throw new GitError(`${name} is checked out in the worktree at ${worktree[1]}. Pull it from there.`)
    throw err
  }
  const after = (await runGit(repoPath, ['rev-parse', ref])).trim()
  return { updated: before !== after }
}

/** The branch "merged" is measured against: the remote's default branch, else a local main or master. */
async function mergeBase(repoPath: string): Promise<{ ref: string; local: string } | null> {
  for (const remote of await listRemotes(repoPath)) {
    try {
      const head = (await runGit(repoPath, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`])).trim()
      if (head) return { ref: head, local: head.slice(remote.length + 1) }
    } catch {
      // No HEAD recorded for this remote (never cloned from it); try the next.
    }
  }
  for (const name of ['main', 'master']) {
    if (await localBranchExists(repoPath, name)) return { ref: name, local: name }
  }
  return null
}

/**
 * Local branches the cleanup dialog could offer: everything but the current
 * branch and the default branch, with what's needed to group and warn about
 * them. Branches sitting exactly on the default branch's tip are left out, as
 * they're usually brand new rather than finished.
 */
export async function listCleanupCandidates(repoPath: string): Promise<CleanupCandidate[]> {
  const out = await runGit(repoPath, [
    'for-each-ref',
    '--format=%(HEAD)%09%(refname:short)%09%(objectname)%09%(upstream:track,nobracket)%09%(committerdate:unix)',
    'refs/heads'
  ])
  const base = await mergeBase(repoPath)
  const baseHash = base ? (await runGit(repoPath, ['rev-parse', base.ref])).trim() : null
  const merged = new Set(
    base
      ? (await runGit(repoPath, ['branch', '--merged', base.ref, '--format=%(refname:short)']))
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      : []
  )
  const candidates: CleanupCandidate[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [head, name, hash, track, date] = line.split('\t')
    if (head === '*' || name === base?.local || hash === baseHash) continue
    const isMerged = merged.has(name)
    const localOnly = isMerged
      ? 0
      : Number((await runGit(repoPath, ['rev-list', '--count', `refs/heads/${name}`, '--not', '--remotes'])).trim()) || 0
    candidates.push({
      name,
      hash,
      gone: (track ?? '').trim() === 'gone',
      mergedInto: isMerged && base ? base.ref : null,
      localOnly,
      lastCommitAt: date ? Number(date) : undefined
    })
  }
  return candidates
}

async function configValue(repoPath: string, key: string): Promise<string | undefined> {
  try {
    return (await runGit(repoPath, ['config', '--get', key])).trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Force-deletes local branches for the cleanup dialog, remembering each one's
 * tip and tracking config so `restoreBranches` can bring them back. A branch
 * that can't be deleted (say it's checked out in another worktree) is skipped
 * and reported rather than stopping the rest.
 */
export async function deleteBranches(
  repoPath: string,
  names: string[]
): Promise<{ deleted: DeletedBranch[]; failed: { name: string; error: string }[] }> {
  const deleted: DeletedBranch[] = []
  const failed: { name: string; error: string }[] = []
  for (const name of names) {
    try {
      const hash = (await runGit(repoPath, ['rev-parse', `refs/heads/${name}`])).trim()
      const remote = await configValue(repoPath, `branch.${name}.remote`)
      const merge = await configValue(repoPath, `branch.${name}.merge`)
      await runGit(repoPath, ['branch', '-D', name])
      deleted.push({ name, hash, remote, merge })
    } catch (err) {
      failed.push({ name, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { deleted, failed }
}

/** Puts branches deleted by `deleteBranches` back, tracking included. */
export async function restoreBranches(repoPath: string, branches: DeletedBranch[]): Promise<void> {
  for (const b of branches) {
    await runGit(repoPath, ['branch', b.name, b.hash])
    if (b.remote) await runGit(repoPath, ['config', `branch.${b.name}.remote`, b.remote])
    if (b.merge) await runGit(repoPath, ['config', `branch.${b.name}.merge`, b.merge])
  }
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
