/** Where an open pull request's commits live, as GitHub reports it. */
export interface PullRequestHead {
  number: number
  /** The GitHub host, e.g. github.com. */
  host: string
  /** The repository the pull request was opened against, which has refs/pull/<number>/head. */
  baseRepo: { owner: string; name: string }
  /** The repository its branch is on: the base repository, a fork, or null once the fork is deleted. */
  headRepo: { owner: string; name: string } | null
  /** The branch's name on the head repository. */
  headRefName: string
  /** The remote to fetch from, when the host already knows it (Azure DevOps); else matched by host and repo. */
  remote?: string
  /** What to fetch; refs/pull/<number>/head when left out (Azure DevOps has no such ref). */
  fetchRef?: string
}

/** What checking out a pull request did. */
export interface PullRequestCheckout {
  /** The local branch now checked out. */
  branch: string
  /** The branch was made just now, rather than an existing one switched to. */
  created: boolean
  /** The existing branch was fast-forwarded to the pull request's head. */
  updated: boolean
  /** The existing branch has commits the pull request doesn't, so it was left where it was. */
  diverged: boolean
  /** The remote branch it tracks, e.g. origin/feature, or null when the head isn't on one of the repo's remotes. */
  upstream: string | null
}

function sameRepo(a: { owner: string; name: string }, b: { owner: string; name: string }): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase()
}

/** Whether the pull request comes from a fork (or a deleted one) rather than a branch of the base repository. */
export function isForkPullRequest(head: PullRequestHead): boolean {
  return !head.headRepo || !sameRepo(head.headRepo, head.baseRepo)
}

/**
 * Local branch names to try, best first: the head branch's own name, then
 * (for a fork, whose branch is often called main) owner/branch, then pr/<number>.
 */
export function pullRequestBranchNames(head: PullRequestHead): string[] {
  const names = [head.headRefName]
  if (head.headRepo && isForkPullRequest(head)) names.push(`${head.headRepo.owner}/${head.headRefName}`)
  names.push(`pr/${head.number}`)
  return [...new Set(names)]
}

/** The banner shown after a checkout. */
export function checkoutNotice(number: number, result: PullRequestCheckout): string {
  const what = result.created
    ? `Checked out #${number} as ${result.branch}`
    : result.updated
      ? `Switched to ${result.branch} and fast-forwarded it to #${number}`
      : result.diverged
        ? `Switched to ${result.branch}. It has commits #${number} doesn't, so it wasn't fast-forwarded`
        : `Switched to ${result.branch}, already up to date with #${number}`
  return result.upstream ? `${what} (tracking ${result.upstream}).` : `${what}.`
}
