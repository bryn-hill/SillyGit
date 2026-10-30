import { GitError, remoteEnv, runGit } from './gitExec'
import { remoteLocations } from './hosting'
import {
  isForkPullRequest,
  pullRequestBranchNames,
  type PullRequestCheckout,
  type PullRequestHead
} from '../shared/prCheckout'

// Remembers which pull request a branch was made for, so checking it out
// again reuses the branch even when it has no upstream (a fork's).
const PR_CONFIG = 'sillygitPullRequest'

async function gitOk(repoPath: string, args: string[], env?: Record<string, string>): Promise<boolean> {
  try {
    await runGit(repoPath, args, env)
    return true
  } catch {
    return false
  }
}

async function gitValue(repoPath: string, args: string[]): Promise<string | null> {
  try {
    return (await runGit(repoPath, args)).trim() || null
  } catch {
    return null
  }
}

/** The repo's remote for `repo`, matched by host and owner/name. */
function remoteFor(
  locations: { remote: string; host: string; path: string }[],
  host: string,
  repo: { owner: string; name: string }
): string | null {
  const path = `${repo.owner}/${repo.name}`.toLowerCase()
  return locations.find((l) => l.host === host.toLowerCase() && l.path.toLowerCase() === path)?.remote ?? null
}

/**
 * Picks the local branch for the pull request: the first candidate name that
 * is free, or already this pull request's branch (made for it, tracking its
 * head, or, for a branch of the base repository, an untracked branch of the
 * same name, which is most likely where it was pushed from).
 */
async function chooseBranch(
  repoPath: string,
  head: PullRequestHead,
  upstream: string | null
): Promise<{ name: string; exists: boolean }> {
  for (const name of pullRequestBranchNames(head)) {
    if (!(await gitOk(repoPath, ['check-ref-format', '--branch', name]))) continue
    if (!(await gitOk(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]))) return { name, exists: false }
    if ((await gitValue(repoPath, ['config', `branch.${name}.${PR_CONFIG}`])) === String(head.number)) return { name, exists: true }
    const tracking = await gitValue(repoPath, ['rev-parse', '--abbrev-ref', `${name}@{upstream}`])
    if (tracking ? tracking === upstream : !isForkPullRequest(head)) return { name, exists: true }
  }
  throw new GitError(`Couldn't find a free branch name for #${head.number}.`)
}

/**
 * Checks a pull request out as a local branch, the way Fork and GitHub
 * Desktop do: fetches refs/pull/<n>/head from the base repository's remote
 * (which works for forks too) and puts it on a branch named after the head
 * branch. When the head branch is on one of the repo's remotes, that's
 * fetched as well and the branch tracks it, so Pull and Push work as usual.
 * A branch that already exists for it is switched to and fast-forwarded.
 */
export async function checkoutPullRequestHead(repoPath: string, head: PullRequestHead): Promise<PullRequestCheckout> {
  const locations = await remoteLocations(repoPath)
  const remotes = (await runGit(repoPath, ['remote'])).split('\n').map((r) => r.trim()).filter(Boolean)
  const baseRemote =
    remoteFor(locations, head.host, head.baseRepo) ??
    (remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : null)
  if (!baseRemote) {
    throw new GitError(`None of this repository's remotes is ${head.baseRepo.owner}/${head.baseRepo.name}, so #${head.number} can't be fetched.`)
  }
  const headRemote = !head.headRepo
    ? null
    : isForkPullRequest(head)
      ? remoteFor(locations, head.host, head.headRepo)
      : baseRemote

  const env = await remoteEnv()
  try {
    await runGit(repoPath, ['fetch', baseRemote, `refs/pull/${head.number}/head`], env)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/couldn't find remote ref/i.test(message)) {
      throw new GitError(`${baseRemote} has no refs/pull/${head.number}/head. Is ${baseRemote} the repository #${head.number} was opened against?`)
    }
    throw err
  }
  const sha = (await runGit(repoPath, ['rev-parse', 'FETCH_HEAD^{commit}'])).trim()

  let upstream: string | null = null
  if (headRemote) {
    const tracking = `refs/remotes/${headRemote}/${head.headRefName}`
    // The head branch can be gone already (deleted after a push); the pull ref is still enough to check out.
    if (await gitOk(repoPath, ['fetch', headRemote, `+refs/heads/${head.headRefName}:${tracking}`], env)) {
      upstream = `${headRemote}/${head.headRefName}`
    }
  }

  const branch = await chooseBranch(repoPath, head, upstream)
  const result: PullRequestCheckout = { branch: branch.name, created: !branch.exists, updated: false, diverged: false, upstream }

  if (!branch.exists) {
    await runGit(repoPath, ['branch', branch.name, sha])
    await runGit(repoPath, ['config', `branch.${branch.name}.${PR_CONFIG}`, String(head.number)])
    if (upstream) await runGit(repoPath, ['branch', `--set-upstream-to=${upstream}`, branch.name])
    await runGit(repoPath, ['checkout', branch.name])
    return result
  }

  const tip = (await runGit(repoPath, ['rev-parse', `refs/heads/${branch.name}`])).trim()
  const behind = tip !== sha && (await gitOk(repoPath, ['merge-base', '--is-ancestor', tip, sha]))
  result.diverged = tip !== sha && !behind && !(await gitOk(repoPath, ['merge-base', '--is-ancestor', sha, tip]))
  if (upstream && !(await gitValue(repoPath, ['rev-parse', '--abbrev-ref', `${branch.name}@{upstream}`]))) {
    await runGit(repoPath, ['branch', `--set-upstream-to=${upstream}`, branch.name])
  }
  if ((await gitValue(repoPath, ['branch', '--show-current'])) !== branch.name) {
    await runGit(repoPath, ['checkout', branch.name])
  }
  if (behind) {
    await runGit(repoPath, ['merge', '--ff-only', sha])
    result.updated = true
  }
  return result
}
