import type { BranchInfo, BranchRemoteInfo, OpenPullRequest, RepoRemote } from './types'

/** Splits "origin/feature/x" into its remote and branch, using the repo's real remote names. */
export function splitRemoteRef(
  name: string,
  remotes: RepoRemote[]
): { remote: RepoRemote; branch: string } | null {
  // Longest first, so a remote called "a/b" wins over "a".
  const remote = [...remotes]
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) => name.startsWith(`${r.name}/`))
  return remote ? { remote, branch: name.slice(remote.name.length + 1) } : null
}

/**
 * Works out where a branch lives on its remote, and its open pull request,
 * from data the app already has, so the branch menu can open without waiting.
 * A local branch is linked through its upstream; one that was never pushed
 * only gets the default remote (for commit links).
 */
export function resolveBranchRemote(
  target: { name: string; remote: boolean },
  branches: BranchInfo[],
  remotes: RepoRemote[],
  pullRequests: OpenPullRequest[]
): BranchRemoteInfo {
  const upstream = target.remote ? target.name : branches.find((b) => !b.remote && b.name === target.name)?.upstream
  const split = upstream ? splitRemoteRef(upstream, remotes) : null
  const remote = split?.remote ?? remotes.find((r) => r.name === 'origin') ?? remotes[0] ?? null
  const remoteBranch = split?.branch ?? null
  const pr = remoteBranch ? pullRequests.find((p) => p.headRefName === remoteBranch) : undefined
  return {
    remote: remote?.name ?? null,
    webUrl: remote?.webUrl ?? null,
    remoteBranch,
    pullRequest: pr ? { number: pr.number, url: pr.url } : null
  }
}
