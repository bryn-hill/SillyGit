import type { Person } from './coAuthors'
import type { CommitSignature } from './signature'

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
  /** Local branches only: commits not on the upstream yet, and upstream commits not here (as of the last fetch). */
  ahead?: number
  behind?: number
  /** Local branches only: the upstream was deleted on the remote (and pruned by a fetch). */
  upstreamGone?: boolean
  /** When the tip commit was made, in Unix seconds. */
  lastCommitAt?: number
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
  /** Absent for co-authors: GitHub's commit lookup only knows the author. */
  hash?: string
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
  /** People credited with `Co-authored-by:` trailers in the body. */
  coAuthors: Person[]
  signature: CommitSignature
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
  authorEmail: string
  date: string
  summary: string
  /** The file's path in that commit, which differs from today's after a rename. */
  path: string
  /** The commit (and path) the line's file came from before `hash`, to blame what came before. */
  previous?: { hash: string; path: string }
  /** A line in the working tree that hasn't been committed yet. */
  uncommitted: boolean
}

/** A commit that changed a file, from `git log --follow`. */
export interface FileHistoryEntry {
  hash: string
  author: string
  authorEmail: string
  /** ISO 8601 author date. */
  date: string
  subject: string
  /** The file's path in this commit. */
  path: string
  /** The path before this commit, when it renamed or copied the file. */
  oldPath?: string
  /** A, M, D, R or C; empty for a merge that didn't change the file itself. */
  status: string
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

/** A fixup or absorb: whether it stopped on conflicts, and whether it rewrote commits already pushed. */
export interface FixupResult extends ConflictableResult {
  pushed: boolean
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

/**
 * How conflicted files looked before a bulk action, so it can be undone: each
 * path's index stages and its working-tree content (as a blob written to the
 * object store), or null where the file was missing.
 */
export interface ConflictSnapshot {
  files: {
    path: string
    stages: { stage: number; mode: string; sha: string }[]
    worktree: { sha: string; executable: boolean } | null
  }[]
}

/** What happened after an external merge tool closed. */
export interface MergeToolResult {
  /** True when the file came back without conflict markers and was staged. */
  resolved: boolean
  /** Why it wasn't marked resolved, for the user. */
  reason?: string
}

/** Claude's suggested resolution of one conflict hunk, for the user to accept or reject. */
export interface AiHunkResolution {
  /** The hunk's id as numbered by parseConflictMarkers. */
  hunkId: number
  /** The lines that replace the hunk, each with its terminator. */
  lines: string[]
  confidence: 'high' | 'medium' | 'low'
  explanation: string
}

export interface AiConflictResolution {
  /** How many hunks the file had when Claude saw it, to catch a file that changed since. */
  hunkCount: number
  resolutions: AiHunkResolution[]
  summary?: string
}

/** Panel layout saved between launches. */
export interface SavedLayout {
  showTerminal: boolean
  terminalHeight: number
  showClaude: boolean
  claudeWidth: number
  /** Width of the commit graph's Branch / Tag column. */
  refColumnWidth: number
  /** Widths of the side bar and detail panel; absent until dragged, so the CSS default applies. */
  sidebarWidth?: number
  detailWidth?: number
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

/** A working-tree file loaded for the in-app editor. */
export type EditableFile =
  | { kind: 'text'; absolutePath: string; content: string }
  | { kind: 'binary' | 'too-large'; absolutePath: string; size: number }
  | { kind: 'missing'; absolutePath: string }

/** How a dragged ref and the branch it's dropped on relate (see main/refDrop.ts). */
export interface DropRelation {
  sourceHash: string
  targetHash: string
  /** The target already has the source: nothing to merge or pick. */
  targetContainsSource: boolean
  /** The source is ahead of the target, so the target can fast-forward to it. */
  sourceContainsTarget: boolean
}

export interface TagInfo {
  name: string
  /** The commit the tag points at (peeled, for an annotated tag). */
  hash: string
  annotated: boolean
  /** The annotation's first line, or the commit's subject for a lightweight tag. */
  subject: string
  /** Unix seconds: when an annotated tag was made, or its commit's date. */
  date: number
}

export interface WorktreeInfo {
  path: string
  /** The checked-out branch, or null when detached. */
  branch: string | null
  head: string | null
  /** The repository's own working tree, which can't be removed. */
  main: boolean
  /** The worktree this window has open. */
  current: boolean
  locked: boolean
  /** Its folder is gone, so `git worktree prune` would drop it. */
  prunable: boolean
}

export interface SubmoduleInfo {
  path: string
  /** The commit checked out in it, or recorded for it when it isn't checked out. */
  hash: string
  /** ok, not checked out yet, on a different commit than the one recorded, or conflicted. */
  state: 'ok' | 'uninitialized' | 'modified' | 'conflict'
}
