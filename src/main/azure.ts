import { basename } from 'path'
import { HttpError, httpFetch } from './http'
import { remoteEnv, runGit } from './gitExec'
import { LAUNCHPAD_BUCKET_ORDER } from '../shared/launchpad'
import {
  AZURE_HOST,
  CLOSED_WORK_ITEM_STATES,
  azurePullRequestUrl,
  azureWorkItemUrl,
  branchFromRef,
  reviewDecisionFromVotes,
  voteLabel,
  type AzureRepo
} from '../shared/azure'
import type { ProviderAccount } from '../shared/accounts'
import type { CreatedPullRequest, CreatePullRequestInput } from '../shared/createPullRequest'
import type { PullRequestHead } from '../shared/prCheckout'
import type {
  PrCheck,
  PrCheckState,
  PrComment,
  PrFile,
  PrFileStatus,
  PrReviewSummary,
  PrReviewThread,
  PullRequestDetail,
  SubmitReviewInput
} from '../shared/prReview'
import type { LaunchpadBucketId, LaunchpadIssue, LaunchpadPullRequest, OpenPullRequest } from '../shared/types'
import type { Credentials, VerifiedAccount } from './providerApi'
import {
  AZURE_MERGE_STRATEGY,
  AZURE_MERGE_STRATEGY_POLICY,
  azureMergeMethods as mergeMethodsFromPolicies,
  type AzurePolicyConfiguration,
  type PrMergeMethod,
  type PrMergeMethods
} from '../shared/mergeOptions'

// Azure DevOps (Azure Repos and Azure Boards) through its REST API, with a
// personal access token. Pull requests here are shaped like GitHub's, so
// Launchpad, the review screen and the create dialog work the same for both.

const API_VERSION = '7.1'

/** A repo's Azure DevOps remote and the signed-in account for its organization. */
export interface AzureAccess {
  repo: AzureRepo
  /** The git remote that points at it, e.g. origin. */
  remote: string
  creds: Credentials
  account: ProviderAccount
}

const seg = encodeURIComponent

function authorization(token: string): string {
  return `Basic ${Buffer.from(`:${token}`).toString('base64')}`
}

function withVersion(url: string, version = API_VERSION): string {
  return url.includes('api-version=') ? url : `${url}${url.includes('?') ? '&' : '?'}api-version=${version}`
}

/**
 * One API call. Azure DevOps answers a token it doesn't accept with a 203
 * and its sign-in page rather than a 401, so that's turned into a 401 here.
 */
export async function azureRequest<T>(
  token: string,
  method: string,
  url: string,
  body?: unknown,
  contentType = 'application/json'
): Promise<T> {
  const res = await httpFetch(withVersion(url), {
    method,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SillyGit',
      Authorization: authorization(token),
      ...(body !== undefined ? { 'Content-Type': contentType } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
  if (res.status === 203 || /text\/html/.test(res.headers.get('content-type') ?? '')) {
    throw new HttpError(401, '401 Unauthorized: the token was not accepted')
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = ((await res.json()) as { message?: string }).message ?? ''
    } catch {
      // Not JSON; the status says enough.
    }
    throw new HttpError(res.status, `${res.status} ${res.statusText || 'error'}${detail ? `: ${detail}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

function orgUrl(organization: string): string {
  return `https://${AZURE_HOST}/${seg(organization)}`
}

function projectUrl(repo: AzureRepo): string {
  return `${orgUrl(repo.organization)}/${seg(repo.project)}`
}

function repoApi(repo: AzureRepo, path: string): string {
  return `${projectUrl(repo)}/_apis/git/repositories/${seg(repo.name)}/${path}`
}

interface ConnectionData {
  authenticatedUser?: {
    id: string
    providerDisplayName?: string
    properties?: { Account?: { $value?: string } }
  }
}

export interface AzureUser {
  id: string
  displayName: string
  /** Usually the account's email address. */
  uniqueName: string
}

async function connectionUser(token: string, organization: string): Promise<AzureUser> {
  const data = await azureRequest<ConnectionData>(token, 'GET', `${orgUrl(organization)}/_apis/connectionData`, undefined)
  const user = data.authenticatedUser
  const uniqueName = user?.properties?.Account?.$value
  // Without a usable token the organization still answers, as the anonymous user.
  if (!user || !uniqueName) throw new HttpError(401, '401 Unauthorized: the token was not accepted')
  return { id: user.id, displayName: user.providerDisplayName || uniqueName, uniqueName }
}

/** Checks the token against its organization and reads who it belongs to. */
export async function verifyAzureAccount(creds: Credentials): Promise<VerifiedAccount> {
  const organization = creds.organization
  if (!organization) throw new Error('enter the organization')
  const user = await connectionUser(creds.token, organization).catch((err: unknown) => {
    if (err instanceof HttpError && err.status === 404)
      throw new Error(`there's no organization called ${organization} on dev.azure.com`)
    throw err
  })
  // The profile has the email; a token limited to one organization may not be allowed to read it.
  const profile = await azureRequest<{ emailAddress?: string }>(
    creds.token,
    'GET',
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me'
  ).catch(() => null)
  const emails = [user.uniqueName, profile?.emailAddress]
    .filter((e): e is string => !!e && e.includes('@'))
    .map((e) => e.toLowerCase())
  return {
    username: user.uniqueName,
    displayName: user.displayName,
    avatarUrl: `${orgUrl(organization)}/_api/_common/identityImage?id=${seg(user.id)}&size=2`,
    avatarHeaders: { Authorization: authorization(creds.token) },
    emails: [...new Set(emails)]
  }
}

// Who the token belongs to, per organization, for as long as the app runs.
const users = new Map<string, Promise<AzureUser>>()

export function azureUser(access: AzureAccess): Promise<AzureUser> {
  const key = `${access.account.id}\n${access.repo.organization.toLowerCase()}`
  let user = users.get(key)
  if (!user) {
    user = connectionUser(access.creds.token, access.repo.organization)
    user.catch(() => users.delete(key))
    users.set(key, user)
  }
  return user
}

/** Turns a 401 into something the user can act on. */
export function explainAzureError(access: AzureAccess, err: unknown): never {
  if (err instanceof HttpError && err.status === 401)
    throw new Error(
      `Azure DevOps rejected the token for ${access.account.username} in ${access.repo.organization}. Add it again in Settings.`
    )
  if (err instanceof HttpError && err.status === 404 && /TF401019|does not exist/i.test(err.message))
    throw new Error(
      `${access.repo.project}/${access.repo.name} wasn't found in ${access.repo.organization}, or the token can't read it.`
    )
  throw err
}

function call<T>(access: AzureAccess, method: string, url: string, body?: unknown, contentType?: string): Promise<T> {
  return azureRequest<T>(access.creds.token, method, url, body, contentType).catch((err: unknown) =>
    explainAzureError(access, err)
  )
}

// ---- Pull requests -------------------------------------------------------

interface AzIdentity {
  id: string
  displayName: string
  uniqueName?: string
}

interface AzReviewer extends AzIdentity {
  vote: number
  isRequired?: boolean
  hasDeclined?: boolean
  isContainer?: boolean
}

export interface AzPullRequest {
  pullRequestId: number
  title: string
  description?: string
  status: 'active' | 'completed' | 'abandoned' | 'notSet' | 'all'
  isDraft?: boolean
  sourceRefName: string
  targetRefName: string
  mergeStatus?: string
  createdBy: AzIdentity
  creationDate: string
  closedDate?: string
  reviewers?: AzReviewer[]
  lastMergeSourceCommit?: { commitId: string }
  lastMergeTargetCommit?: { commitId: string }
  repository?: { id?: string; name?: string; project?: { id?: string; name?: string } }
  forkSource?: { repository?: { name?: string; project?: { name?: string } } }
}

const ACTIVE_TOP = 100

async function listPullRequests(access: AzureAccess, criteria: Record<string, string>): Promise<AzPullRequest[]> {
  const query = Object.entries({ 'searchCriteria.status': 'active', ...criteria, $top: String(ACTIVE_TOP) })
    .map(([k, v]) => `${seg(k)}=${seg(v)}`)
    .join('&')
  return (await call<{ value: AzPullRequest[] }>(access, 'GET', repoApi(access.repo, `pullrequests?${query}`))).value
}

function votesOf(pr: AzPullRequest, excludeId?: string): number[] {
  return (pr.reviewers ?? []).filter((r) => r.id !== excludeId && !r.hasDeclined).map((r) => r.vote)
}

/** Which Launchpad bucket a pull request goes in, by the same rules as GitHub's (see launchpad.ts). */
export function azureBucket(pr: AzPullRequest, me: string, isMine: boolean): LaunchpadBucketId {
  if (pr.isDraft) return 'draft'
  if (!isMine) return 'needsMyReview'
  if (pr.mergeStatus === 'conflicts') return 'conflicts'
  const votes = votesOf(pr, me)
  const decision = reviewDecisionFromVotes(votes)
  if (decision === 'APPROVED') return 'readyToMerge'
  if (decision === 'CHANGES_REQUESTED') return 'changesRequested'
  if (votes.length === 0) return 'unassignedReviewers'
  return 'waitingForReview'
}

function toLaunchpad(
  pr: AzPullRequest,
  access: AzureAccess,
  me: string,
  isMine: boolean,
  repoPath: string
): LaunchpadPullRequest {
  return {
    number: pr.pullRequestId,
    title: pr.title,
    url: azurePullRequestUrl(access.repo, pr.pullRequestId),
    author: pr.createdBy.displayName,
    isMine,
    isDraft: !!pr.isDraft,
    headRefName: branchFromRef(pr.sourceRefName),
    baseRefName: branchFromRef(pr.targetRefName),
    updatedAt: pr.creationDate,
    // The list doesn't say how big a pull request is.
    additions: 0,
    deletions: 0,
    bucket: azureBucket(pr, me, isMine),
    repoPath,
    repoName: basename(repoPath),
    provider: 'azure'
  }
}

/** The user's own open pull requests and the ones they're a reviewer on, for Launchpad. */
export async function azureLaunchpad(access: AzureAccess, repoPath: string): Promise<LaunchpadPullRequest[]> {
  const me = await azureUser(access).catch((err: unknown) => explainAzureError(access, err))
  const [authored, reviewing] = await Promise.all([
    listPullRequests(access, { 'searchCriteria.creatorId': me.id }),
    listPullRequests(access, { 'searchCriteria.reviewerId': me.id })
  ])
  const theirs = reviewing.filter((pr) => pr.createdBy.id !== me.id)
  return [
    ...authored.map((pr) => toLaunchpad(pr, access, me.id, true, repoPath)),
    ...theirs.map((pr) => toLaunchpad(pr, access, me.id, false, repoPath))
  ].sort((a, b) => LAUNCHPAD_BUCKET_ORDER.indexOf(a.bucket) - LAUNCHPAD_BUCKET_ORDER.indexOf(b.bucket))
}

/** Open pull requests, for the branch menu. */
export async function azureOpenPullRequests(access: AzureAccess): Promise<OpenPullRequest[]> {
  return (await listPullRequests(access, {})).map((pr) => ({
    number: pr.pullRequestId,
    url: azurePullRequestUrl(access.repo, pr.pullRequestId),
    headRefName: branchFromRef(pr.sourceRefName),
    title: pr.title
  }))
}

function getPullRequest(access: AzureAccess, id: number): Promise<AzPullRequest> {
  return call<AzPullRequest>(access, 'GET', repoApi(access.repo, `pullrequests/${id}`))
}

/** Completes (merges) a pull request with a merge commit, as Launchpad's Merge does on GitHub. */
export async function azureMergePullRequest(access: AzureAccess, id: number, method: PrMergeMethod = 'merge'): Promise<void> {
  const pr = await getPullRequest(access, id)
  await call(access, 'PATCH', repoApi(access.repo, `pullrequests/${id}`), {
    status: 'completed',
    lastMergeSourceCommit: pr.lastMergeSourceCommit,
    completionOptions: { mergeStrategy: AZURE_MERGE_STRATEGY[method] }
  })
}

/** The merge methods the target branch's "Require a merge strategy" policies allow. */
export async function azureMergeMethods(access: AzureAccess, id: number): Promise<PrMergeMethods> {
  const [pr, policies] = await Promise.all([
    getPullRequest(access, id),
    call<{ value: AzurePolicyConfiguration[] }>(
      access,
      'GET',
      `${projectUrl(access.repo)}/_apis/policy/configurations?policyType=${AZURE_MERGE_STRATEGY_POLICY}`
    )
  ])
  return mergeMethodsFromPolicies(policies.value, pr.repository?.id, pr.targetRefName)
}

// ---- Review --------------------------------------------------------------

interface AzPosition {
  line: number
  offset: number
}

interface AzComment {
  id: number
  parentCommentId?: number
  author: AzIdentity
  content?: string
  publishedDate: string
  commentType?: string
  isDeleted?: boolean
}

export interface AzThread {
  id: number
  status?: string
  isDeleted?: boolean
  publishedDate?: string
  threadContext?: {
    filePath: string
    rightFileStart?: AzPosition | null
    rightFileEnd?: AzPosition | null
    leftFileStart?: AzPosition | null
    leftFileEnd?: AzPosition | null
  } | null
  comments: AzComment[]
  properties?: Record<string, { $value?: unknown } | undefined>
}

const OPEN_THREAD_STATUSES = new Set(['active', 'pending', 'unknown', undefined])

function toComment(c: AzComment): PrComment {
  return { id: String(c.id), author: c.author.displayName, body: c.content ?? '', createdAt: c.publishedDate }
}

function isPerson(c: AzComment): boolean {
  return c.commentType !== 'system' && !c.isDeleted
}

/**
 * Thread ids are only unique within a pull request, and replying needs both,
 * so the review screen gets "<pull request>:<thread>".
 */
export function threadKey(pullRequestId: number, threadId: number): string {
  return `${pullRequestId}:${threadId}`
}

function parseThreadKey(key: string): { pullRequestId: number; threadId: number } {
  const [pr, thread] = key.split(':').map(Number)
  if (!Number.isSafeInteger(pr) || !Number.isSafeInteger(thread)) throw new Error(`Unknown thread ${key}.`)
  return { pullRequestId: pr, threadId: thread }
}

/** Splits threads into the conversation and the ones on lines of a file. */
export function splitThreads(
  pullRequestId: number,
  threads: AzThread[]
): { comments: PrComment[]; threads: PrReviewThread[] } {
  const comments: PrComment[] = []
  const lineThreads: PrReviewThread[] = []
  for (const t of threads) {
    if (t.isDeleted) continue
    const said = t.comments.filter(isPerson)
    if (said.length === 0) continue
    const ctx = t.threadContext
    if (!ctx?.filePath) {
      comments.push(...said.map(toComment))
      continue
    }
    const right = ctx.rightFileEnd ?? ctx.rightFileStart
    const left = ctx.leftFileEnd ?? ctx.leftFileStart
    const side = right ? 'RIGHT' : 'LEFT'
    const end = right ?? left
    const start = right ? ctx.rightFileStart : ctx.leftFileStart
    lineThreads.push({
      id: threadKey(pullRequestId, t.id),
      path: ctx.filePath.replace(/^\//, ''),
      line: end?.line ?? null,
      startLine: start && end && start.line < end.line ? start.line : null,
      side,
      isResolved: !OPEN_THREAD_STATUSES.has(t.status),
      isOutdated: false,
      comments: said.map(toComment)
    })
  }
  comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { comments, threads: lineThreads }
}

/** Each reviewer's vote as a review, timed by the system note Azure DevOps leaves when they vote. */
export function votesAsReviews(reviewers: AzReviewer[], threads: AzThread[]): PrReviewSummary[] {
  const votedAt = new Map<string, string>()
  for (const t of threads) {
    if (t.properties?.CodeReviewThreadType?.$value !== 'VoteUpdate') continue
    const who = String(t.properties?.CodeReviewVotedByIdentity?.$value ?? '')
    const at = t.publishedDate ?? t.comments[0]?.publishedDate ?? ''
    if (who && at > (votedAt.get(who) ?? '')) votedAt.set(who, at)
  }
  return reviewers
    .filter((r) => r.vote !== 0)
    .map((r) => ({
      id: r.id,
      author: r.displayName,
      state: r.vote > 0 ? 'APPROVED' : 'CHANGES_REQUESTED',
      body: voteLabel(r.vote),
      submittedAt: votedAt.get(r.id) ?? ''
    }))
}

interface AzStatus {
  state?: string
  description?: string
  targetUrl?: string
  context?: { name?: string; genre?: string }
}

interface AzPolicyEvaluation {
  status?: string
  configuration?: { isBlocking?: boolean; isEnabled?: boolean; type?: { displayName?: string }; settings?: { displayName?: string } }
  context?: { buildId?: number }
}

function statusCheck(s: AzStatus): PrCheck {
  const state: PrCheckState =
    s.state === 'succeeded'
      ? 'success'
      : s.state === 'failed' || s.state === 'error'
        ? 'failure'
        : s.state === 'notApplicable'
          ? 'skipped'
          : 'pending'
  const name = [s.context?.genre, s.context?.name].filter(Boolean).join('/') || 'Status'
  return { name, state, url: s.targetUrl, description: s.description }
}

function policyCheck(e: AzPolicyEvaluation, repo: AzureRepo): PrCheck {
  const state: PrCheckState =
    e.status === 'approved'
      ? 'success'
      : e.status === 'rejected' || e.status === 'broken'
        ? 'failure'
        : e.status === 'notApplicable'
          ? 'skipped'
          : 'pending'
  const type = e.configuration?.type?.displayName ?? 'Policy'
  const name = e.configuration?.settings?.displayName ? `${type}: ${e.configuration.settings.displayName}` : type
  const url = e.context?.buildId ? `${projectUrl(repo)}/_build/results?buildId=${e.context.buildId}` : undefined
  return { name, state, url, description: e.configuration?.isBlocking ? 'Required' : 'Optional' }
}

/** Branch policies (builds, reviewer counts, linked work items) and posted statuses, as checks. */
async function pullRequestChecks(access: AzureAccess, pr: AzPullRequest): Promise<PrCheck[]> {
  const projectId = pr.repository?.project?.id
  const [statuses, policies] = await Promise.all([
    call<{ value: AzStatus[] }>(access, 'GET', repoApi(access.repo, `pullRequests/${pr.pullRequestId}/statuses`))
      .then((r) => r.value)
      .catch(() => []),
    projectId
      ? azureRequest<{ value: AzPolicyEvaluation[] }>(
          access.creds.token,
          'GET',
          withVersion(
            `${projectUrl(access.repo)}/_apis/policy/evaluations?artifactId=${seg(
              `vstfs:///CodeReview/CodeReviewId/${projectId}/${pr.pullRequestId}`
            )}`,
            '7.1-preview.1'
          )
        )
          .then((r) => r.value.filter((e) => e.configuration?.isEnabled !== false))
          .catch(() => [])
      : Promise.resolve([])
  ])
  return [...policies.map((e) => policyCheck(e, access.repo)), ...statuses.map(statusCheck)]
}

/**
 * Splits `git diff` output into files, the way GitHub's files list comes:
 * each file's hunks (without its headers), or null for a binary file.
 */
export function parseDiffFiles(nameStatus: string, diff: string): PrFile[] {
  const fields = nameStatus.split('\0')
  const entries: { status: PrFileStatus; path: string; previousPath?: string }[] = []
  for (let i = 0; i < fields.length && fields[i]; ) {
    const code = fields[i++]
    const kind = code[0]
    if (kind === 'R' || kind === 'C') {
      const previousPath = fields[i++]
      const path = fields[i++]
      entries.push({ status: kind === 'R' ? 'renamed' : 'copied', path, previousPath })
    } else {
      const path = fields[i++]
      entries.push({ status: kind === 'A' ? 'added' : kind === 'D' ? 'removed' : kind === 'M' ? 'modified' : 'changed', path })
    }
  }
  const chunks = diff.split(/^diff --git /m).slice(1)
  return entries.map((entry, i) => {
    const chunk = chunks[i] ?? ''
    const at = chunk.search(/^@@/m)
    const binary = at < 0 && /^Binary files /m.test(chunk)
    const patch = binary ? null : at < 0 ? '' : chunk.slice(at).replace(/\n$/, '')
    let additions = 0
    let deletions = 0
    for (const line of (patch ?? '').split('\n')) {
      if (line.startsWith('+')) additions++
      else if (line.startsWith('-')) deletions++
    }
    return { ...entry, additions, deletions, patch }
  })
}

async function hasCommit(repoPath: string, sha: string | undefined): Promise<boolean> {
  if (!sha) return false
  return runGit(repoPath, ['cat-file', '-e', `${sha}^{commit}`]).then(
    () => true,
    () => false
  )
}

/**
 * Azure DevOps has no API for a pull request's diff, so its branches are
 * fetched and diffed here, from where they forked (as the website shows it).
 */
async function localPullRequestFiles(repoPath: string, access: AzureAccess, pr: AzPullRequest): Promise<PrFile[]> {
  const source = branchFromRef(pr.sourceRefName)
  const target = branchFromRef(pr.targetRefName)
  const remote = access.remote
  const tracking = (b: string): string => `refs/remotes/${remote}/${b}`
  // The source branch can be gone once the pull request is completed; its commits may still be here.
  await runGit(
    repoPath,
    ['fetch', remote, `+refs/heads/${source}:${tracking(source)}`, `+refs/heads/${target}:${tracking(target)}`],
    await remoteEnv()
  ).catch(() => undefined)
  const pick = async (sha: string | undefined, branch: string): Promise<string> =>
    (await hasCommit(repoPath, sha)) ? (sha as string) : tracking(branch)
  const range = `${await pick(pr.lastMergeTargetCommit?.commitId, target)}...${await pick(
    pr.lastMergeSourceCommit?.commitId,
    source
  )}`
  const base = ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '-M']
  const [nameStatus, diff] = await Promise.all([
    runGit(repoPath, [...base, '--name-status', '-z', range]),
    runGit(repoPath, [...base, range])
  ])
  return parseDiffFiles(nameStatus, diff)
}

const STATE: Record<AzPullRequest['status'], PullRequestDetail['state']> = {
  active: 'OPEN',
  completed: 'MERGED',
  abandoned: 'CLOSED',
  notSet: 'OPEN',
  all: 'OPEN'
}

/** Everything the review screen shows for one pull request. */
export async function azurePullRequestDetail(access: AzureAccess, repoPath: string, id: number): Promise<PullRequestDetail> {
  const [pr, threads, me] = await Promise.all([
    getPullRequest(access, id),
    call<{ value: AzThread[] }>(access, 'GET', repoApi(access.repo, `pullRequests/${id}/threads`)).then((r) => r.value),
    azureUser(access).catch((err: unknown) => explainAzureError(access, err))
  ])
  const [files, checks] = await Promise.all([localPullRequestFiles(repoPath, access, pr), pullRequestChecks(access, pr)])
  const split = splitThreads(id, threads)
  const reviewers = pr.reviewers ?? []
  return {
    repoPath,
    number: pr.pullRequestId,
    title: pr.title,
    body: pr.description ?? '',
    url: azurePullRequestUrl(access.repo, pr.pullRequestId),
    author: pr.createdBy.displayName,
    state: STATE[pr.status] ?? 'OPEN',
    isDraft: !!pr.isDraft,
    headRefName: branchFromRef(pr.sourceRefName),
    baseRefName: branchFromRef(pr.targetRefName),
    headSha: pr.lastMergeSourceCommit?.commitId ?? '',
    mergeable: pr.mergeStatus === 'conflicts' ? 'CONFLICTING' : pr.mergeStatus === 'succeeded' ? 'MERGEABLE' : 'UNKNOWN',
    reviewDecision: reviewDecisionFromVotes(votesOf(pr)),
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
    createdAt: pr.creationDate,
    viewer: me.displayName,
    checks,
    reviews: votesAsReviews(reviewers, threads),
    comments: split.comments,
    threads: split.threads,
    files,
    provider: 'azure'
  }
}

const VOTE: Record<SubmitReviewInput['event'], number | null> = { APPROVE: 10, REQUEST_CHANGES: -5, COMMENT: null }

function newThread(content: string, context?: AzThread['threadContext']): Record<string, unknown> {
  return {
    comments: [{ parentCommentId: 0, content, commentType: 1 }],
    status: 'active',
    ...(context ? { threadContext: context } : {})
  }
}

/**
 * Sends a review: every drafted line comment as its own thread, the summary
 * as a comment, then the vote (approve, or "waiting for author" for
 * requested changes).
 */
export async function azureSubmitReview(access: AzureAccess, id: number, input: SubmitReviewInput): Promise<void> {
  const threads = repoApi(access.repo, `pullRequests/${id}/threads`)
  for (const c of input.comments) {
    const start = { line: c.startLine != null && c.startLine < c.line ? c.startLine : c.line, offset: 1 }
    const end = { line: c.line, offset: 1 }
    const context =
      c.side === 'RIGHT'
        ? { filePath: `/${c.path}`, rightFileStart: start, rightFileEnd: end }
        : { filePath: `/${c.path}`, leftFileStart: start, leftFileEnd: end }
    await call(access, 'POST', threads, newThread(c.body, context))
  }
  if (input.body.trim()) await call(access, 'POST', threads, newThread(input.body))
  const vote = VOTE[input.event]
  if (vote !== null) {
    const me = await azureUser(access)
    await call(access, 'PUT', repoApi(access.repo, `pullRequests/${id}/reviewers/${seg(me.id)}`), { vote })
  }
}

export async function azureAddComment(access: AzureAccess, id: number, body: string): Promise<void> {
  await call(access, 'POST', repoApi(access.repo, `pullRequests/${id}/threads`), newThread(body))
}

export async function azureReplyToThread(access: AzureAccess, key: string, body: string): Promise<void> {
  const { pullRequestId, threadId } = parseThreadKey(key)
  await call(access, 'POST', repoApi(access.repo, `pullRequests/${pullRequestId}/threads/${threadId}/comments`), {
    content: body,
    parentCommentId: 1,
    commentType: 1
  })
}

export async function azureSetThreadResolved(access: AzureAccess, key: string, resolved: boolean): Promise<void> {
  const { pullRequestId, threadId } = parseThreadKey(key)
  await call(access, 'PATCH', repoApi(access.repo, `pullRequests/${pullRequestId}/threads/${threadId}`), {
    status: resolved ? 'fixed' : 'active'
  })
}

/** Where the pull request's commits are, for checking it out: its source branch, on the same remote. */
export async function azurePullRequestHead(access: AzureAccess, id: number): Promise<PullRequestHead> {
  const pr = await getPullRequest(access, id)
  if (pr.forkSource?.repository) {
    throw new Error(`#${id} comes from a fork (${pr.forkSource.repository.name}); add the fork as a remote and check out its branch.`)
  }
  const repo = { owner: `${access.repo.organization}/${access.repo.project}`, name: access.repo.name }
  const branch = branchFromRef(pr.sourceRefName)
  return {
    number: id,
    host: AZURE_HOST,
    baseRepo: repo,
    headRepo: repo,
    headRefName: branch,
    remote: access.remote,
    fetchRef: `refs/heads/${branch}`
  }
}

// ---- Creating pull requests ---------------------------------------------

interface AzTeamMember {
  identity: AzIdentity & { isContainer?: boolean }
}

/** The project's default team, whose members are the likely reviewers. */
async function teamMembers(access: AzureAccess): Promise<AzIdentity[]> {
  const project = await call<{ defaultTeam?: { id: string } }>(
    access,
    'GET',
    `${orgUrl(access.repo.organization)}/_apis/projects/${seg(access.repo.project)}`
  )
  if (!project.defaultTeam) return []
  const members = await call<{ value: AzTeamMember[] }>(
    access,
    'GET',
    `${orgUrl(access.repo.organization)}/_apis/projects/${seg(access.repo.project)}/teams/${seg(project.defaultTeam.id)}/members?$top=200`
  )
  return members.value.map((m) => m.identity).filter((i) => !(i as { isContainer?: boolean }).isContainer)
}

/** People who can be asked for a review (the project team, by email), minus whoever is signed in. */
export async function azureSuggestedReviewers(access: AzureAccess): Promise<string[]> {
  const [members, me] = await Promise.all([teamMembers(access), azureUser(access).catch(() => null)])
  return members
    .filter((m) => m.id !== me?.id)
    .map((m) => m.uniqueName || m.displayName)
    .filter(Boolean)
}

/** A reviewer's id from their email or name: the project team first, then the organization's directory. */
async function reviewerId(access: AzureAccess, who: string, team: AzIdentity[]): Promise<string> {
  const lower = who.toLowerCase()
  const member = team.find((m) => m.uniqueName?.toLowerCase() === lower || m.displayName.toLowerCase() === lower)
  if (member) return member.id
  const found = await call<{ value: { id: string }[] }>(
    access,
    'GET',
    `https://vssps.dev.azure.com/${seg(access.repo.organization)}/_apis/identities?searchFilter=General&filterValue=${seg(
      who
    )}&queryMembership=None`
  )
  if (!found.value[0]) throw new Error(`no one called ${who} in ${access.repo.organization}`)
  return found.value[0].id
}

function explainCreateError(err: unknown, input: CreatePullRequestInput): never {
  const message = err instanceof Error ? err.message : String(err)
  if (/TF401179/.test(message)) throw new Error(`There's already an open pull request from ${input.head} into ${input.base}.`)
  if (/TF401398|TF401028|could not be found/i.test(message))
    throw new Error(`Azure DevOps can't find ${input.head} on the remote. Push it first.`)
  if (/TF401180/.test(message)) throw new Error('The branch to merge and the base are the same branch.')
  throw err instanceof Error ? err : new Error(message)
}

/** Azure DevOps keeps at most 4000 characters of a description. */
const MAX_DESCRIPTION = 4000

/** Opens a pull request, then adds the reviewers; a reviewer that can't be added comes back as `reviewersError`. */
export async function azureCreatePullRequest(
  access: AzureAccess,
  input: CreatePullRequestInput,
  workItems: number[] = []
): Promise<CreatedPullRequest> {
  const description =
    input.body.length > MAX_DESCRIPTION ? `${input.body.slice(0, MAX_DESCRIPTION - 1)}…` : input.body
  const pr = await call<AzPullRequest>(access, 'POST', repoApi(access.repo, 'pullrequests'), {
    sourceRefName: `refs/heads/${input.head}`,
    targetRefName: `refs/heads/${input.base}`,
    title: input.title.trim(),
    description,
    isDraft: input.draft,
    ...(workItems.length ? { workItemRefs: workItems.map((id) => ({ id: String(id) })) } : {})
  }).catch((err: unknown) => explainCreateError(err, input))
  const created: CreatedPullRequest = {
    number: pr.pullRequestId,
    url: azurePullRequestUrl(access.repo, pr.pullRequestId),
    title: pr.title
  }
  if (input.reviewers.length > 0) {
    const failed: string[] = []
    const team = await teamMembers(access).catch(() => [])
    for (const who of input.reviewers) {
      try {
        const reviewer = await reviewerId(access, who, team)
        await call(access, 'PUT', repoApi(access.repo, `pullRequests/${pr.pullRequestId}/reviewers/${seg(reviewer)}`), {
          vote: 0
        })
      } catch (err) {
        failed.push(`${who} (${err instanceof Error ? err.message : String(err)})`)
      }
    }
    if (failed.length) created.reviewersError = `Couldn't add ${failed.join(', ')} as reviewers.`
  }
  return created
}

// ---- Azure Boards --------------------------------------------------------

interface AzWorkItem {
  id: number
  fields: Record<string, unknown>
}

function identityName(value: unknown): string {
  if (value && typeof value === 'object') return (value as { displayName?: string }).displayName ?? 'unknown'
  return typeof value === 'string' ? value.replace(/\s*<.*>$/, '') : 'unknown'
}

/** Open work items assigned to the user in the repo's project, most recently changed first. */
export async function azureAssignedWorkItems(access: AzureAccess, repoPath: string): Promise<LaunchpadIssue[]> {
  const closed = CLOSED_WORK_ITEM_STATES.map((s) => `'${s}'`).join(', ')
  const query = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @me AND [System.State] NOT IN (${closed}) ORDER BY [System.ChangedDate] DESC`
  }
  const found = await call<{ workItems: { id: number }[] }>(access, 'POST', `${projectUrl(access.repo)}/_apis/wit/wiql?$top=50`, query)
  const ids = found.workItems.map((w) => w.id).slice(0, 50)
  if (ids.length === 0) return []
  const fields = ['System.Title', 'System.WorkItemType', 'System.Tags', 'System.ChangedDate', 'System.CreatedBy', 'System.State']
  const items = await call<{ value: AzWorkItem[] }>(
    access,
    'GET',
    `${orgUrl(access.repo.organization)}/_apis/wit/workitems?ids=${ids.join(',')}&fields=${fields.join(',')}`
  )
  const order = new Map(ids.map((id, i) => [id, i]))
  return items.value
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((w) => {
      const tags = String(w.fields['System.Tags'] ?? '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
      const type = String(w.fields['System.WorkItemType'] ?? '')
      return {
        number: w.id,
        title: String(w.fields['System.Title'] ?? ''),
        url: azureWorkItemUrl(access.repo, w.id),
        author: identityName(w.fields['System.CreatedBy']),
        // Work item types and tags have no colour of their own here; the label's style gives them one.
        labels: [type, ...tags].filter(Boolean).map((name) => ({ name, color: '' })),
        updatedAt: String(w.fields['System.ChangedDate'] ?? ''),
        repoPath,
        repoName: basename(repoPath),
        provider: 'azure' as const
      }
    })
}

// ---- Avatars -------------------------------------------------------------

/** The organization's picture for whoever uses `email`, with the headers it needs; null when nobody does. */
export async function azureAvatarFor(
  creds: Credentials,
  organization: string,
  email: string
): Promise<{ url: string; headers: Record<string, string> } | null> {
  const found = await azureRequest<{ value: { id: string }[] }>(
    creds.token,
    'GET',
    `https://vssps.dev.azure.com/${seg(organization)}/_apis/identities?searchFilter=MailAddress&filterValue=${seg(
      email
    )}&queryMembership=None`
  )
  const id = found.value[0]?.id
  if (!id) return null
  return {
    url: `${orgUrl(organization)}/_api/_common/identityImage?id=${seg(id)}&size=2`,
    headers: { Authorization: authorization(creds.token) }
  }
}
