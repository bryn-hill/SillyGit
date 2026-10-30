import { execFile } from 'child_process'
import { basename } from 'path'
import { promisify } from 'util'
import { LAUNCHPAD_BUCKET_ORDER } from '../shared/launchpad'
import * as github from './github'
import { azureAccess, githubAccess, type GithubAccess } from './hosting'
import {
  azureAssignedWorkItems,
  azureLaunchpad,
  azureMergeMethods,
  azureMergePullRequest,
  type AzureAccess
} from './azure'
import { githubMergeMethods, type PrMergeMethod, type PrMergeMethods } from '../shared/mergeOptions'
import { HttpError } from './http'
import type {
  LaunchpadBucketId,
  LaunchpadData,
  LaunchpadIssue,
  LaunchpadPullRequest,
  LaunchpadSkippedRepo
} from '../shared/types'

const execFileAsync = promisify(execFile)

const PR_FIELDS = [
  'number',
  'title',
  'url',
  'author',
  'isDraft',
  'headRefName',
  'baseRefName',
  'mergeable',
  'reviewDecision',
  'reviewRequests',
  'reviews',
  'statusCheckRollup',
  'updatedAt',
  'additions',
  'deletions'
].join(',')

const ISSUE_FIELDS = 'number,title,url,author,labels,updatedAt'

type RepoResult = { pullRequests: LaunchpadPullRequest[]; issues: LaunchpadIssue[] } | { skipped: LaunchpadSkippedRepo }

interface RawCheckRollupItem {
  state?: string
  status?: string
  conclusion?: string
}

interface RawReview {
  author?: { login?: string }
  state?: string
}

interface RawPullRequest {
  number: number
  title: string
  url: string
  author: { login: string }
  isDraft: boolean
  headRefName: string
  baseRefName: string
  mergeable: string
  reviewDecision: string
  reviewRequests: unknown[]
  reviews: RawReview[]
  statusCheckRollup: RawCheckRollupItem[]
  updatedAt: string
  additions: number
  deletions: number
}

async function runGh(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('gh', args, {
    cwd: repoPath,
    maxBuffer: 1024 * 1024 * 16
  })
  return stdout
}

function isEnoent(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === 'ENOENT'
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const stderr = (err as { stderr?: string }).stderr
    return stderr?.trim() || err.message
  }
  return String(err)
}

function ciFailingOrPending(rollup: RawCheckRollupItem[] | undefined): 'failing' | 'pending' | 'clear' {
  if (!rollup || rollup.length === 0) return 'clear'
  let pending = false
  for (const item of rollup) {
    if (item.conclusion !== undefined) {
      if (['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(item.conclusion)) return 'failing'
      if (item.status && item.status !== 'COMPLETED') pending = true
    } else if (item.state) {
      if (item.state === 'FAILURE' || item.state === 'ERROR') return 'failing'
      if (item.state === 'PENDING') pending = true
    }
  }
  return pending ? 'pending' : 'clear'
}

function classifyBucket(pr: RawPullRequest, login: string, isMine: boolean): LaunchpadBucketId {
  if (pr.isDraft) return 'draft'
  if (!isMine) return 'needsMyReview'

  if (pr.mergeable === 'CONFLICTING') return 'conflicts'
  if (ciFailingOrPending(pr.statusCheckRollup) === 'failing') return 'failingCI'
  if (pr.reviewDecision === 'APPROVED') return 'readyToMerge'
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'changesRequested'

  const othersReviews = (pr.reviews ?? []).filter((r) => r.author?.login !== login)
  if ((pr.reviewRequests ?? []).length === 0 && othersReviews.length === 0) return 'unassignedReviewers'
  if (othersReviews.some((r) => r.state === 'COMMENTED')) return 'reviewerCommented'
  return 'waitingForReview'
}

function toPullRequest(
  pr: RawPullRequest,
  login: string,
  isMine: boolean,
  repoPath: string,
  repoName: string
): LaunchpadPullRequest {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: pr.author?.login ?? 'unknown',
    isMine,
    isDraft: pr.isDraft,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    updatedAt: pr.updatedAt,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    bucket: classifyBucket(pr, login, isMine),
    repoPath,
    repoName
  }
}

function toIssue(issue: github.GhStyleIssue, repoPath: string, repoName: string): LaunchpadIssue {
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    author: issue.author?.login ?? 'unknown',
    labels: (issue.labels ?? []).map((l) => ({ name: l.name, color: l.color })),
    updatedAt: issue.updatedAt,
    repoPath,
    repoName
  }
}

function bucketSort(a: LaunchpadPullRequest, b: LaunchpadPullRequest): number {
  const order = LAUNCHPAD_BUCKET_ORDER.indexOf(a.bucket) - LAUNCHPAD_BUCKET_ORDER.indexOf(b.bucket)
  if (order !== 0) return order
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function isNotGithubError(message: string): boolean {
  return /no git remotes found|could not determine|not a git repository|failed to determine/i.test(message)
}

async function getRepoPullRequests(repoPath: string, login: () => Promise<string>): Promise<RepoResult> {
  const repoName = basename(repoPath)
  try {
    const authored = JSON.parse(
      await runGh(repoPath, ['pr', 'list', '--state', 'open', '--author', '@me', '--json', PR_FIELDS])
    ) as RawPullRequest[]
    const reviewRequested = JSON.parse(
      await runGh(repoPath, [
        'pr',
        'list',
        '--state',
        'open',
        '--search',
        'review-requested:@me',
        '--json',
        PR_FIELDS
      ])
    ) as RawPullRequest[]
    // Issues are extra: a repo with them turned off still shows its pull requests.
    const issues = await runGh(repoPath, ['issue', 'list', '--state', 'open', '--assignee', '@me', '--json', ISSUE_FIELDS])
      .then((out) => (JSON.parse(out) as github.GhStyleIssue[]).map((i) => toIssue(i, repoPath, repoName)))
      .catch(() => [])
    return { pullRequests: classify(authored, reviewRequested, await login(), repoPath, repoName), issues }
  } catch (err) {
    const message = errorMessage(err)
    if (isNotGithubError(message)) {
      return { skipped: { repoPath, repoName, reason: 'not-github' } }
    }
    return { skipped: { repoPath, repoName, reason: 'error', message } }
  }
}

function classify(
  authored: RawPullRequest[],
  reviewRequested: RawPullRequest[],
  login: string,
  repoPath: string,
  repoName: string
): LaunchpadPullRequest[] {
  const mine = authored.map((pr) => toPullRequest(pr, login, true, repoPath, repoName))
  const theirs = reviewRequested
    .filter((pr) => pr.author?.login !== login)
    .map((pr) => toPullRequest(pr, login, false, repoPath, repoName))
  return [...mine, ...theirs]
}

/** The same as getRepoPullRequests, through the GitHub API with the signed-in account's token. */
async function getRepoPullRequestsByApi(repoPath: string, access: GithubAccess): Promise<RepoResult> {
  const repoName = basename(repoPath)
  try {
    const [{ authored, reviewRequested }, issues] = await Promise.all([
      github.launchpadPullRequests(access.creds, access.repo),
      github.assignedIssues(access.creds, access.repo).catch(() => [])
    ])
    return {
      pullRequests: classify(authored, reviewRequested, access.account.username, repoPath, repoName),
      issues: issues.map((i) => toIssue(i, repoPath, repoName))
    }
  } catch (err) {
    const message =
      err instanceof HttpError && err.status === 401
        ? `${access.repo.host} rejected the token for ${access.account.username}. Add it again in Settings.`
        : errorMessage(err)
    return { skipped: { repoPath, repoName, reason: 'error', message } }
  }
}

async function getRepoPullRequestsByAzure(repoPath: string, access: AzureAccess): Promise<RepoResult> {
  try {
    // Work items are extra, like GitHub issues: a token without Work Items access still shows pull requests.
    const [pullRequests, issues] = await Promise.all([
      azureLaunchpad(access, repoPath),
      azureAssignedWorkItems(access, repoPath).catch(() => [])
    ])
    return { pullRequests, issues }
  } catch (err) {
    return { skipped: { repoPath, repoName: basename(repoPath), reason: 'error', message: errorMessage(err) } }
  }
}

type AzureLookup = { access: AzureAccess } | { error: string } | null

type GhLogin = { login: string } | { unavailable: LaunchpadData }

async function ghLogin(repoPath: string): Promise<GhLogin> {
  try {
    return { login: (await runGh(repoPath, ['api', 'user', '--jq', '.login'])).trim() }
  } catch (err) {
    if (isEnoent(err)) {
      return { unavailable: { connected: false, reason: 'gh-not-installed', pullRequests: [] } }
    }
    const message = errorMessage(err)
    if (/not logged into|gh auth login/i.test(message)) {
      return { unavailable: { connected: false, reason: 'not-authenticated', pullRequests: [] } }
    }
    return { unavailable: { connected: false, reason: 'error', message, pullRequests: [] } }
  }
}

/**
 * Pull requests across the repos. A repo on a GitHub host with a signed-in
 * account goes through the API; the rest fall back to the gh CLI.
 */
export async function getLaunchpadData(repoPaths: string[]): Promise<LaunchpadData> {
  const paths = [...new Set(repoPaths)]
  if (paths.length === 0) return { connected: true, pullRequests: [], issues: [] }

  // A repo on Azure DevOps goes through its API, or is skipped when no account can reach it.
  const azure = await Promise.all(
    paths.map(
      (p): Promise<AzureLookup> =>
        azureAccess(p).then(
          (a) => (a ? { access: a } : null),
          (err: unknown) => ({ error: errorMessage(err) })
        )
    )
  )
  const azureErrors = azure.flatMap((a) => (a && 'error' in a ? [a.error] : []))
  if (azureErrors.length === paths.length) return { connected: false, reason: 'error', message: azureErrors[0], pullRequests: [] }
  const access = await Promise.all(paths.map((p, i) => (azure[i] ? null : githubAccess(p).catch(() => null))))
  const viaGh = paths.filter((_, i) => !access[i] && !azure[i])

  // gh is only needed (and only asked who's signed in, once) for repos without an account.
  const gh: { login?: Promise<GhLogin> } = {}
  const getGh = (): Promise<GhLogin> => (gh.login ??= ghLogin(viaGh[0]))
  if (viaGh.length > 0 && viaGh.length === paths.length) {
    const result = await getGh()
    if ('unavailable' in result) return result.unavailable
  }

  const perRepo = await Promise.all(
    paths.map(async (repoPath, i) => {
      const onAzure = azure[i]
      if (onAzure && 'access' in onAzure) return getRepoPullRequestsByAzure(repoPath, onAzure.access)
      if (onAzure) {
        return { skipped: { repoPath, repoName: basename(repoPath), reason: 'error' as const, message: onAzure.error } }
      }
      const repoAccess = access[i]
      if (repoAccess) return getRepoPullRequestsByApi(repoPath, repoAccess)
      const result = await getGh()
      if ('unavailable' in result) {
        const repoName = basename(repoPath)
        const message =
          result.unavailable.reason === 'error'
            ? result.unavailable.message
            : 'Add a GitHub token in Settings (or sign in to the GitHub CLI) to see its pull requests.'
        return { skipped: { repoPath, repoName, reason: 'error' as const, message } }
      }
      return getRepoPullRequests(repoPath, async () => result.login)
    })
  )

  const pullRequests = perRepo
    .flatMap((r) => ('pullRequests' in r ? r.pullRequests : []))
    .sort(bucketSort)
  const issues = perRepo
    .flatMap((r) => ('issues' in r ? r.issues : []))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const skippedRepos = perRepo.flatMap((r) => ('skipped' in r ? [r.skipped] : []))
  const firstAccess = access.find((a) => a)
  const ghResult = gh.login ? await gh.login : null
  const firstAzure = azure.find((a): a is { access: AzureAccess } => !!a && 'access' in a)
  const login =
    firstAccess?.account.username ??
    (ghResult && 'login' in ghResult ? ghResult.login : undefined) ??
    firstAzure?.access.account.username

  return { connected: true, login, pullRequests, issues, skippedRepos }
}

/** The merge methods pull request `number`'s repository allows, so Launchpad offers only those. */
export async function pullRequestMergeMethods(repoPath: string, number: number): Promise<PrMergeMethods> {
  const az = await azureAccess(repoPath)
  if (az) return azureMergeMethods(az, number)
  const access = await githubAccess(repoPath)
  if (access) return github.mergeMethods(access.creds, access.repo)
  const { stdout } = await execFileAsync(
    'gh',
    ['repo', 'view', '--json', 'mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed'],
    { cwd: repoPath }
  )
  const flags = JSON.parse(stdout) as { mergeCommitAllowed?: boolean; squashMergeAllowed?: boolean; rebaseMergeAllowed?: boolean }
  return githubMergeMethods({
    allow_merge_commit: flags.mergeCommitAllowed,
    allow_squash_merge: flags.squashMergeAllowed,
    allow_rebase_merge: flags.rebaseMergeAllowed
  })
}

export async function mergePullRequest(repoPath: string, number: number, method: PrMergeMethod = 'merge'): Promise<void> {
  const az = await azureAccess(repoPath)
  if (az) return azureMergePullRequest(az, number, method)
  const access = await githubAccess(repoPath)
  if (access) await github.mergePullRequest(access.creds, access.repo, number, method)
  else await execFileAsync('gh', ['pr', 'merge', String(number), `--${method}`], { cwd: repoPath })
}
