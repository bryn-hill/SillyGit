// Types for reviewing a GitHub pull request inside the app (Launchpad → PR).

export type PrCheckState = 'success' | 'failure' | 'pending' | 'neutral' | 'skipped'

export interface PrCheck {
  name: string
  state: PrCheckState
  url?: string
  description?: string
}

export interface PrComment {
  id: string
  author: string
  body: string
  createdAt: string
}

export type PrReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'

export interface PrReviewSummary {
  id: string
  author: string
  state: PrReviewState
  body: string
  submittedAt: string
}

export type DiffSide = 'LEFT' | 'RIGHT'

/** A conversation on a line (or range of lines) of the diff. */
export interface PrReviewThread {
  id: string
  path: string
  /** The line on `side` the thread sits under; null once the code it was on has changed. */
  line: number | null
  startLine: number | null
  side: DiffSide
  isResolved: boolean
  isOutdated: boolean
  /** The hunk GitHub stored with the first comment, shown for outdated threads. */
  diffHunk?: string
  comments: PrComment[]
}

export type PrFileStatus = 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'

export interface PrFile {
  path: string
  previousPath?: string
  status: PrFileStatus
  additions: number
  deletions: number
  /** The file's hunks; null when GitHub leaves them out (binary or very large files). */
  patch: string | null
}

export interface PullRequestDetail {
  repoPath: string
  number: number
  title: string
  body: string
  url: string
  author: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  headRefName: string
  baseRefName: string
  headSha: string
  mergeable: string
  reviewDecision: string
  additions: number
  deletions: number
  createdAt: string
  /** Who the app is signed in as; GitHub won't let them approve their own pull request. */
  viewer: string
  checks: PrCheck[]
  reviews: PrReviewSummary[]
  /** The pull request's conversation comments (not tied to a line). */
  comments: PrComment[]
  threads: PrReviewThread[]
  files: PrFile[]
}

/** A line comment written in the app and not sent yet; it goes out with the review. */
export interface DraftReviewComment {
  id: string
  path: string
  line: number
  side: DiffSide
  /** For a comment on several lines: the first of them (same side). */
  startLine?: number
  body: string
}

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'

export interface SubmitReviewInput {
  /** The head commit the review is about; GitHub ties the line comments to it. */
  headSha: string
  event: ReviewEvent
  body: string
  comments: DraftReviewComment[]
}

export const REVIEW_EVENT_LABELS: Record<ReviewEvent, string> = {
  COMMENT: 'Comment',
  APPROVE: 'Approve',
  REQUEST_CHANGES: 'Request changes'
}

/** Why a review can't be sent as it stands, or null when it can. */
export function reviewProblem(input: Omit<SubmitReviewInput, 'headSha'>, isOwnPullRequest: boolean): string | null {
  if (isOwnPullRequest && input.event !== 'COMMENT') return "You can't approve or request changes on your own pull request."
  if (input.event === 'REQUEST_CHANGES' && !input.body.trim() && input.comments.length === 0)
    return 'Say what needs changing, in the summary or a line comment.'
  if (input.event === 'COMMENT' && !input.body.trim() && input.comments.length === 0)
    return 'Write a comment, or add a line comment first.'
  if (input.comments.some((c) => !c.body.trim())) return 'A line comment is empty.'
  return null
}

/** Threads attached to a file's diff, keyed `${side}:${line}`; outdated ones are listed separately. */
export function threadsByLine(
  threads: PrReviewThread[],
  path: string
): { byLine: Map<string, PrReviewThread[]>; outdated: PrReviewThread[] } {
  const byLine = new Map<string, PrReviewThread[]>()
  const outdated: PrReviewThread[] = []
  for (const t of threads) {
    if (t.path !== path) continue
    if (t.line == null) {
      outdated.push(t)
      continue
    }
    const key = `${t.side}:${t.line}`
    byLine.set(key, [...(byLine.get(key) ?? []), t])
  }
  return { byLine, outdated }
}

/** Overall state of a set of checks, for the summary line. */
export function checksSummary(checks: PrCheck[]): { state: PrCheckState; text: string } {
  if (checks.length === 0) return { state: 'neutral', text: 'No checks' }
  const failed = checks.filter((c) => c.state === 'failure').length
  const pending = checks.filter((c) => c.state === 'pending').length
  const passed = checks.filter((c) => c.state === 'success').length
  if (failed) return { state: 'failure', text: `${failed} failing, ${passed} passed${pending ? `, ${pending} pending` : ''}` }
  if (pending) return { state: 'pending', text: `${pending} pending, ${passed} passed` }
  return { state: 'success', text: `All ${checks.length} checks passed` }
}
