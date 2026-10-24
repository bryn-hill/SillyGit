import { contextBridge, ipcRenderer } from 'electron'

type Wrapped<T> = Promise<{ ok: true; data: T } | { ok: false; error: string }>

const api = {
  openRepoDialog: (): Promise<string | null> => ipcRenderer.invoke('repo:open-dialog'),
  isGitRepo: (repoPath: string): Promise<boolean> => ipcRenderer.invoke('repo:is-git-repo', repoPath),
  initRepo: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('repo:init', repoPath),

  getStatus: (repoPath: string): Wrapped<import('../shared/types').RepoStatus> =>
    ipcRenderer.invoke('git:status', repoPath),
  stage: (repoPath: string, paths: string[]): Wrapped<void> =>
    ipcRenderer.invoke('git:stage', repoPath, paths),
  unstage: (repoPath: string, paths: string[]): Wrapped<void> =>
    ipcRenderer.invoke('git:unstage', repoPath, paths),
  stageAll: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:stage-all', repoPath),
  unstageAll: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:unstage-all', repoPath),
  discard: (repoPath: string, path: string, untracked: boolean): Wrapped<void> =>
    ipcRenderer.invoke('git:discard', repoPath, path, untracked),
  commit: (repoPath: string, message: string): Wrapped<void> =>
    ipcRenderer.invoke('git:commit', repoPath, message),
  diff: (repoPath: string, path: string, staged: boolean, untracked: boolean): Wrapped<string> =>
    ipcRenderer.invoke('git:diff', repoPath, path, staged, untracked),
  branches: (repoPath: string): Wrapped<import('../shared/types').BranchInfo[]> =>
    ipcRenderer.invoke('git:branches', repoPath),
  checkout: (repoPath: string, branch: string): Wrapped<void> =>
    ipcRenderer.invoke('git:checkout', repoPath, branch),
  createBranch: (repoPath: string, branch: string): Wrapped<void> =>
    ipcRenderer.invoke('git:create-branch', repoPath, branch),
  push: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:push', repoPath),
  pull: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:pull', repoPath),
  log: (repoPath: string): Wrapped<import('../shared/types').CommitInfo[]> =>
    ipcRenderer.invoke('git:log', repoPath),
  graphLog: (repoPath: string): Wrapped<import('../shared/types').GraphCommit[]> =>
    ipcRenderer.invoke('git:graph-log', repoPath),
  commitDetail: (repoPath: string, hash: string): Wrapped<import('../shared/types').CommitDetail> =>
    ipcRenderer.invoke('git:commit-detail', repoPath, hash),
  commitFileDiff: (
    repoPath: string,
    hash: string,
    path: string,
    ignoreWhitespace?: boolean
  ): Wrapped<string> =>
    ipcRenderer.invoke('git:commit-file-diff', repoPath, hash, path, ignoreWhitespace),
  stash: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:stash', repoPath),
  stashPop: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:stash-pop', repoPath),
  fileAtRef: (repoPath: string, ref: string, path: string): Wrapped<string> =>
    ipcRenderer.invoke('git:file-at-ref', repoPath, ref, path),
  workingFile: (repoPath: string, path: string): Wrapped<string> =>
    ipcRenderer.invoke('git:working-file', repoPath, path),
  blame: (repoPath: string, ref: string, path: string): Wrapped<import('../shared/types').BlameLine[]> =>
    ipcRenderer.invoke('git:blame', repoPath, ref, path),
  fileHistory: (
    repoPath: string,
    path: string,
    fromRef: string,
    limit?: number
  ): Wrapped<import('../shared/types').CommitInfo[]> =>
    ipcRenderer.invoke('git:file-history', repoPath, path, fromRef, limit),
  revertHunk: (repoPath: string, diffText: string, unitId: string): Wrapped<void> =>
    ipcRenderer.invoke('git:revert-hunk', repoPath, diffText, unitId),
  openPath: (absolutePath: string): Wrapped<void> => ipcRenderer.invoke('shell:open-path', absolutePath),

  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('settings:has-api-key'),
  setApiKey: (key: string): Wrapped<void> => ipcRenderer.invoke('settings:set-api-key', key),
  aiGenerateCommitMessage: (repoPath: string): Wrapped<string> =>
    ipcRenderer.invoke('ai:generate-commit-message', repoPath),
  aiReviewCommit: (repoPath: string, hash: string): Wrapped<import('../shared/types').AiReviewResponse> =>
    ipcRenderer.invoke('ai:review-commit', repoPath, hash),
  aiReviewFile: (
    repoPath: string,
    hash: string,
    path: string
  ): Wrapped<import('../shared/types').AiReviewResponse> =>
    ipcRenderer.invoke('ai:review-file', repoPath, hash, path),
  aiProposeSplit: (
    repoPath: string,
    hash: string
  ): Wrapped<import('../shared/types').CommitSplitProposal> =>
    ipcRenderer.invoke('ai:propose-split', repoPath, hash),
  aiApplySplit: (
    repoPath: string,
    proposal: import('../shared/types').CommitSplitProposal
  ): Wrapped<void> => ipcRenderer.invoke('ai:apply-split', repoPath, proposal)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
