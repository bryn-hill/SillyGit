import { remoteEnv, runGit } from './gitExec'
import * as azure from './azure'
import { transportFor } from './githubTransport'
import { azureAccess } from './hosting'
import { issueForBranch } from './issueWork'
import { HttpError } from './http'
import type { CreatedPullRequest, CreatePullRequestInput } from '../shared/createPullRequest'

async function config(repoPath: string, key: string): Promise<string | null> {
  const out = await runGit(repoPath, ['config', '--get', key]).catch(() => '')
  return out.trim() || null
}

/**
 * Pushes a local branch (checked out or not) to `remote`: to the branch it
 * already tracks there, or else under its own name, setting that as its
 * upstream. Returns the branch's name on the remote.
 */
export async function pushBranch(repoPath: string, branch: string, remote: string): Promise<string> {
  const trackedRemote = await config(repoPath, `branch.${branch}.remote`)
  const merge = await config(repoPath, `branch.${branch}.merge`)
  const remoteBranch = trackedRemote === remote && merge ? merge.replace(/^refs\/heads\//, '') : branch
  await runGit(
    repoPath,
    ['push', ...(trackedRemote === remote ? [] : ['-u']), remote, `refs/heads/${branch}:refs/heads/${remoteBranch}`],
    await remoteEnv()
  )
  return remoteBranch
}

/** GitHub's 422 answers name the problem but read like an API; this says it the way the dialog would. */
function explainCreateError(err: unknown, input: CreatePullRequestInput): never {
  const message = err instanceof Error ? err.message : String(err)
  if (/pull request already exists/i.test(message))
    throw new Error(`There's already an open pull request from ${input.head} into ${input.base}.`)
  if (/no commits between/i.test(message))
    throw new Error(`${input.head} has no commits that aren't on ${input.base} yet, so there's nothing to review.`)
  if (/draft pull requests are not supported/i.test(message))
    throw new Error("This repository's plan doesn't allow draft pull requests. Untick Draft and try again.")
  if (err instanceof HttpError && err.status === 422 && /head/i.test(message))
    throw new Error(`GitHub can't find ${input.head} on the remote. Push it first.`)
  throw err instanceof Error ? err : new Error(message)
}

/**
 * Opens a pull request on GitHub, through the signed-in account's token or
 * else the gh CLI, then asks the reviewers. A failed review request doesn't
 * undo the pull request; it comes back as `reviewersError`.
 */
export async function createPullRequest(repoPath: string, input: CreatePullRequestInput): Promise<CreatedPullRequest> {
  const az = await azureAccess(repoPath)
  if (az) {
    // A branch started from a work item gets the pull request linked to it.
    const workItem = await issueForBranch(repoPath, input.head)
    return azure.azureCreatePullRequest(az, input, workItem ? [workItem] : [])
  }
  const t = await transportFor(repoPath)
  const path = `repos/${t.repo.owner}/${t.repo.name}/pulls`
  const pr = await t
    .rest<{ number: number; html_url: string; title: string }>('POST', path, {
      title: input.title.trim(),
      body: input.body,
      head: input.head,
      base: input.base,
      draft: input.draft
    })
    .catch((err: unknown) => explainCreateError(err, input))
  const created: CreatedPullRequest = { number: pr.number, url: pr.html_url, title: pr.title }
  if (input.reviewers.length > 0) {
    try {
      await t.rest('POST', `${path}/${pr.number}/requested_reviewers`, { reviewers: input.reviewers })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      created.reviewersError = `Couldn't ask ${input.reviewers.join(', ')} for a review: ${message}`
    }
  }
  return created
}

/** People who can be asked for a review (the repo's assignable users), minus whoever is signed in. */
export async function suggestedReviewers(repoPath: string): Promise<string[]> {
  const az = await azureAccess(repoPath)
  if (az) return azure.azureSuggestedReviewers(az)
  const t = await transportFor(repoPath)
  const [assignees, me] = await Promise.all([
    t.rest<{ login: string }[]>('GET', `repos/${t.repo.owner}/${t.repo.name}/assignees?per_page=100`),
    t.rest<{ login: string }>('GET', 'user').catch(() => null)
  ])
  return assignees.map((a) => a.login).filter((login) => login !== me?.login)
}
