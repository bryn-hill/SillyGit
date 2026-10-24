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
