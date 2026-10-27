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

/** A git remote and the web page of its repository, when it's on a host we know. */
export interface RepoRemote {
  name: string
  webUrl: string | null
}

/** An open pull request, as `gh pr list` reports it. */
export interface OpenPullRequest {
  number: number
  url: string
  headRefName: string
}

/** Where a branch lives on its hosting site, for the branch right-click menu. */
export interface BranchRemoteInfo {
  /** e.g. "origin"; null when the repo has no remote to link to. */
  remote: string | null
  /** e.g. "https://github.com/owner/repo"; null when the remote isn't a web host we know. */
  webUrl: string | null
  /** The branch's name on the remote, or null when it hasn't been pushed. */
  remoteBranch: string | null
  /** The open pull request whose head is this branch, if any. */
  pullRequest: { number: number; url: string } | null
}

export interface StashEntry {
  /** e.g. "stash@{0}" */
  ref: string
  hash: string
  /** e.g. "WIP on main: 1a2b3c4 Subject" or "On main: my message" */
  message: string
  date: string
}

/** A commit search match and its row in the full graph (0 = newest). */
export interface CommitSearchHit {
  hash: string
  index: number
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
  authorEmail: string
  date: string
  /** Committer date; the graph is ordered by it, so sprint markers use it too. */
  committedAt: string
  subject: string
  refs: string[]
}

/** A commit email to find an avatar for, and one of its commits (GitHub looks users up by commit). */
export interface AvatarRequest {
  email: string
  hash: string
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

/**
 * How Pull brings remote commits in, like GitKraken's Pull menu: `ff` merges
 * when the branches have diverged and fast-forwards otherwise, `ff-only`
 * refuses to merge, `rebase` replays local commits on top.
 */
export type PullMode = 'ff' | 'ff-only' | 'rebase'

export interface ConflictFileContent {
  path: string
  /**
   * 'text': both sides exist and are text, so `marked` holds diff3 markers.
   * 'deleted-current' / 'deleted-incoming': one side deleted the file.
   * 'binary': at least one side is binary; only whole-file picks are possible.
   */
  kind: 'text' | 'deleted-current' | 'deleted-incoming' | 'binary'
  marked: string
  /**
   * Length of the conflict markers in `marked`: 7, or longer when the file's
   * own lines start with a run of marker characters that long.
   */
  markerSize?: number
  currentLabel: string
  incomingLabel: string
  /**
   * Set when the conflict comes from a rename: one side renamed the file and
   * the other renamed it differently or deleted it. Each side's name for it,
   * or null where that side deleted it.
   */
  rename?: RenameConflict
  /**
   * Set when one side added a folder where the other added a file: git kept
   * the folder and moved the file aside to `path`. The folder's name, and
   * the side the file came from.
   */
  folderInTheWay?: { folder: string; fileSide: 'current' | 'incoming' }
}

export interface RenameConflict {
  from: string
  current: string | null
  incoming: string | null
}

/** Which name to keep when resolving a rename conflict ('none' deletes the file). */
export type RenameKeep = 'current' | 'incoming' | 'both' | 'none'

/** Panel layout saved between launches. */
export interface SavedLayout {
  showTerminal: boolean
  terminalHeight: number
  showClaude: boolean
  claudeWidth: number
  /** Width of the commit graph's Branch / Tag column. */
  refColumnWidth: number
}

/** What the window restores on launch. */
export interface SavedSession {
  /** The repo that was open at last quit, if it is still a git repo. */
  repoPath: string | null
  /** The repo that was open at last quit but whose folder is gone or no longer a git repo. */
  missingRepo: string | null
  /** Recently opened repos that still exist, most recent first. */
  recentRepos: string[]
  /** Repos open as tabs at last quit that still exist, in tab order. */
  openTabs: string[]
  /** Which of openTabs are pinned. */
  pinnedTabs: string[]
  layout: Partial<SavedLayout>
}

/** The repo tabs across the top of the window. */
export interface SavedTabs {
  openTabs: string[]
  pinnedTabs: string[]
  /** The tab showing, or null when none is open. */
  activeTab: string | null
}
