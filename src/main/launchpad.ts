import { execFile } from 'child_process'
import { basename } from 'path'
import { promisify } from 'util'
import { LAUNCHPAD_BUCKET_ORDER } from '../shared/launchpad'
import * as github from './github'
import { githubAccess, type GithubAccess } from './hosting'
import { HttpError } from './http'
import type {
  LaunchpadBucketId,
  LaunchpadData,
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

function bucketSort(a: LaunchpadPullRequest, b: LaunchpadPullRequest): number {
  const order = LAUNCHPAD_BUCKET_ORDER.indexOf(a.bucket) - LAUNCHPAD_BUCKET_ORDER.indexOf(b.bucket)
  if (order !== 0) return order
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function isNotGithubError(message: string): boolean {
  return /no git remotes found|could not determine|not a git repository|failed to determine/i.test(message)
}

async function getRepoPullRequests(
  repoPath: string,
  login: () => Promise<string>
): Promise<{ pullRequests: LaunchpadPullRequest[] } | { skipped: LaunchpadSkippedRepo }> {
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
    return { pullRequests: classify(authored, reviewRequested, await login(), repoPath, repoName) }
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
async function getRepoPullRequestsByApi(
  repoPath: string,
  access: GithubAccess
): Promise<{ pullRequests: LaunchpadPullRequest[] } | { skipped: LaunchpadSkippedRepo }> {
  const repoName = basename(repoPath)
  try {
    const { authored, reviewRequested } = await github.launchpadPullRequests(access.creds, access.repo)
    return { pullRequests: classify(authored, reviewRequested, access.account.username, repoPath, repoName) }
  } catch (err) {
    const message =
      err instanceof HttpError && err.status === 401
        ? `${access.repo.host} rejected the token for ${access.account.username}. Add it again in Settings.`
        : errorMessage(err)
    return { skipped: { repoPath, repoName, reason: 'error', message } }
  }
}

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
  if (paths.length === 0) return { connected: true, pullRequests: [] }

  const access = await Promise.all(paths.map((p) => githubAccess(p).catch(() => null)))
  const viaGh = paths.filter((_, i) => !access[i])

  // gh is only needed (and only asked who's signed in, once) for repos without an account.
  const gh: { login?: Promise<GhLogin> } = {}
  const getGh = (): Promise<GhLogin> => (gh.login ??= ghLogin(viaGh[0]))
  if (viaGh.length === paths.length) {
    const result = await getGh()
    if ('unavailable' in result) return result.unavailable
  }

  const perRepo = await Promise.all(
    paths.map(async (repoPath, i) => {
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
  const skippedRepos = perRepo.flatMap((r) => ('skipped' in r ? [r.skipped] : []))
  const firstAccess = access.find((a) => a)
  const ghResult = gh.login ? await gh.login : null
  const login = firstAccess?.account.username ?? (ghResult && 'login' in ghResult ? ghResult.login : undefined)

  return { connected: true, login, pullRequests, skippedRepos }
}

export async function mergePullRequest(repoPath: string, number: number): Promise<void> {
  const access = await githubAccess(repoPath)
  if (access) await github.mergePullRequest(access.creds, access.repo, number)
  else await execFileAsync('gh', ['pr', 'merge', String(number), '--merge'], { cwd: repoPath })
}
