export interface FileStatus {
  path: string
  origPath?: string
  index: string
  worktree: string
  untracked: boolean
}

export interface RepoStatus {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: FileStatus[]
  unstaged: FileStatus[]
  conflicted: FileStatus[]
}

export interface BranchInfo {
  name: string
  current: boolean
  remote: boolean
  /** The commit the branch points at. */
  hash?: string
  /** Local branches only: the remote branch it tracks, e.g. "origin/main". */
  upstream?: string
}

/** Where a branch lives on its hosting site, for the branch right-click menu. */
export interface BranchRemoteInfo {
  /** e.g. "origin"; null when the repo has no remote to link to. */
  remote: string | null
  /** e.g. "https://github.com/owner/repo"; null when the remote isn't a web host we know. */
  webUrl: string | null
  /** The branch's name on the remote, or null when it hasn't been pushed. */
  remoteBranch: string | null
  /** The open pull request whose head is this branch, when gh can find one. */
  pullRequest: { number: number; url: string } | null
}

export interface CommitInfo {
  hash: string
  author: string
  date: string
  subject: string
}

export interface GraphCommit {
  hash: string
  parents: string[]
  author: string
  date: string
  subject: string
  refs: string[]
}

export interface CommitFileChange {
  path: string
  origPath?: string
  status: string
}

export interface CommitDetail {
  hash: string
  parents: string[]
  author: string
  authorEmail: string
  date: string
  subject: string
  body: string
  files: CommitFileChange[]
}

export interface GitResult {
  ok: boolean
  error?: string
}

export interface AiFinding {
  file?: string
  line?: number
  severity: 'high' | 'medium' | 'low' | 'info'
  summary: string
}

export interface AiReviewResponse {
  findings: AiFinding[]
  summary?: string
  raw?: string
}

export interface SplitGroupProposal {
  message: string
  files: string[]
  unitIds: string[]
}

export interface CommitSplitProposal {
  headHash: string
  parentHash: string
  groups: SplitGroupProposal[]
}

export interface BlameLine {
  lineNo: number
  hash: string
  author: string
  date: string
  summary: string
}

export type LaunchpadBucketId =
  | 'readyToMerge'
  | 'needsMyReview'
  | 'changesRequested'
  | 'failingCI'
  | 'conflicts'
  | 'unassignedReviewers'
  | 'reviewerCommented'
  | 'waitingForReview'
  | 'draft'
  | 'other'

export interface LaunchpadPullRequest {
  number: number
  title: string
  url: string
  author: string
  isMine: boolean
  isDraft: boolean
  headRefName: string
  baseRefName: string
  updatedAt: string
  additions: number
  deletions: number
  bucket: LaunchpadBucketId
  repoPath: string
  repoName: string
}

export type LaunchpadUnavailableReason = 'gh-not-installed' | 'not-authenticated' | 'not-github' | 'error'

export interface LaunchpadSkippedRepo {
  repoPath: string
  repoName: string
  reason: 'not-github' | 'error'
  message?: string
}

export interface LaunchpadData {
  connected: boolean
  reason?: LaunchpadUnavailableReason
  message?: string
  login?: string
  pullRequests: LaunchpadPullRequest[]
  skippedRepos?: LaunchpadSkippedRepo[]
}

/** A merge, rebase, cherry-pick or revert that stopped part way, usually on conflicts. */
export interface OperationState {
  kind: 'merge' | 'rebase' | 'cherry-pick' | 'revert'
  /** Display name of the "ours" side (A in the resolver). */
  currentLabel: string
  /** Display name of the "theirs" side (B in the resolver). */
  incomingLabel: string
  /** The prepared commit message (MERGE_MSG), with git's comment lines removed. */
  message?: string
  /** Rebase only: the branch being rebased. */
  rebaseBranch?: string
  /** Rebase progress: the commit being applied, counting from 1. */
  step?: number
  total?: number
}

/** Result of a git command that can stop on conflicts instead of failing. */
export interface ConflictableResult {
  conflicts: boolean
}

export interface ConflictFileContent {
  path: string
  /**
   * 'text': both sides exist and are text, so `marked` holds diff3 markers.
   * 'deleted-current' / 'deleted-incoming': one side deleted the file.
   * 'binary': at least one side is binary; only whole-file picks are possible.
   */
  kind: 'text' | 'deleted-current' | 'deleted-incoming' | 'binary'
  marked: string
  currentLabel: string
  incomingLabel: string
}
