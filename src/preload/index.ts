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
  openExternal: (url: string): Wrapped<void> => ipcRenderer.invoke('shell:open-external', url),

  cherryPick: (repoPath: string, hash: string): Wrapped<void> =>
    ipcRenderer.invoke('git:cherry-pick', repoPath, hash),
  revertCommit: (repoPath: string, hash: string): Wrapped<void> =>
    ipcRenderer.invoke('git:revert-commit', repoPath, hash),
  resetTo: (repoPath: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): Wrapped<void> =>
    ipcRenderer.invoke('git:reset-to', repoPath, hash, mode),
  createBranchAt: (
    repoPath: string,
    branch: string,
    startPoint: string,
    checkout?: boolean
  ): Wrapped<void> => ipcRenderer.invoke('git:create-branch-at', repoPath, branch, startPoint, checkout),
  createTag: (repoPath: string, name: string, hash: string): Wrapped<void> =>
    ipcRenderer.invoke('git:create-tag', repoPath, name, hash),
  createAnnotatedTag: (repoPath: string, name: string, message: string, hash: string): Wrapped<void> =>
    ipcRenderer.invoke('git:create-annotated-tag', repoPath, name, message, hash),
  createPatchFile: (repoPath: string, hash: string): Wrapped<void> =>
    ipcRenderer.invoke('git:create-patch-file', repoPath, hash),
  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write-text', text),

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
  ): Wrapped<void> => ipcRenderer.invoke('ai:apply-split', repoPath, proposal),

  launchpadGetData: (repoPaths: string[]): Wrapped<import('../shared/types').LaunchpadData> =>
    ipcRenderer.invoke('launchpad:get-data', repoPaths),
  launchpadMergePr: (repoPath: string, number: number): Wrapped<void> =>
    ipcRenderer.invoke('launchpad:merge-pr', repoPath, number),
  getWorkspaceRepos: (): Promise<string[]> => ipcRenderer.invoke('settings:get-workspace-repos'),
  addWorkspaceRepo: (repoPath: string): Wrapped<string[]> =>
    ipcRenderer.invoke('settings:add-workspace-repo', repoPath),
  removeWorkspaceRepo: (repoPath: string): Wrapped<string[]> =>
    ipcRenderer.invoke('settings:remove-workspace-repo', repoPath),

  terminalCreate: (cwd: string | undefined, cols: number, rows: number): Promise<number> =>
    ipcRenderer.invoke('terminal:create', cwd, cols, rows),
  terminalWrite: (id: number, data: string): void => ipcRenderer.send('terminal:write', id, data),
  terminalResize: (id: number, cols: number, rows: number): void =>
    ipcRenderer.send('terminal:resize', id, cols, rows),
  terminalKill: (id: number): void => ipcRenderer.send('terminal:kill', id),
  onTerminalData: (callback: (id: number, data: string) => void): (() => void) => {
    const listener = (_e: unknown, id: number, data: string): void => callback(id, data)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalExit: (callback: (id: number, exitCode: number) => void): (() => void) => {
    const listener = (_e: unknown, id: number, exitCode: number): void => callback(id, exitCode)
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  },

  claudeStart: (opts: import('../shared/claude').ClaudeStartOptions): Wrapped<number> =>
    ipcRenderer.invoke('claude:start', opts),
  claudeSend: (id: number, text: string, images?: { mediaType: string; data: string }[]): Wrapped<void> =>
    ipcRenderer.invoke('claude:send', id, text, images),
  claudeInterrupt: (id: number): Wrapped<void> => ipcRenderer.invoke('claude:interrupt', id),
  claudeRespond: (
    id: number,
    requestId: string,
    decision: import('../shared/claude').ClaudePermissionDecision
  ): Wrapped<void> => ipcRenderer.invoke('claude:respond', id, requestId, decision),
  claudeSetMode: (id: number, mode: import('../shared/claude').ClaudePermissionMode): Wrapped<void> =>
    ipcRenderer.invoke('claude:set-mode', id, mode),
  claudeSetModel: (id: number, model: string): Wrapped<void> => ipcRenderer.invoke('claude:set-model', id, model),
  claudeClose: (id: number): Wrapped<void> => ipcRenderer.invoke('claude:close', id),
  claudeListSessions: (cwd: string): Wrapped<import('../shared/claude').ClaudeSessionSummary[]> =>
    ipcRenderer.invoke('claude:list-sessions', cwd),
  claudeListFiles: (cwd: string): Wrapped<string[]> => ipcRenderer.invoke('claude:list-files', cwd),
  onClaudeEvent: (callback: (id: number, event: import('../shared/claude').ClaudeEvent) => void): (() => void) => {
    const listener = (_e: unknown, id: number, event: import('../shared/claude').ClaudeEvent): void =>
      callback(id, event)
    ipcRenderer.on('claude:event', listener)
    return () => ipcRenderer.removeListener('claude:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
