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
  commit: (repoPath: string, message: string, amend?: boolean): Wrapped<void> =>
    ipcRenderer.invoke('git:commit', repoPath, message, amend),
  lastCommitMessage: (repoPath: string): Wrapped<string> => ipcRenderer.invoke('git:last-commit-message', repoPath),
  fetch: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:fetch', repoPath),
  undoLabel: (repoPath: string): Wrapped<string | null> => ipcRenderer.invoke('git:undo-label', repoPath),
  undo: (repoPath: string): Wrapped<string> => ipcRenderer.invoke('git:undo', repoPath),
  searchCommits: (repoPath: string, query: string): Wrapped<import('../shared/types').CommitSearchHit[]> =>
    ipcRenderer.invoke('git:search-commits', repoPath, query),
  /** Starts watching `repoPath` for outside changes (null stops); see onRepoChanged. */
  watchRepo: (repoPath: string | null): Promise<void> => ipcRenderer.invoke('repo:watch', repoPath),
  onRepoChanged: (callback: (repoPath: string) => void): (() => void) => {
    const listener = (_e: unknown, repoPath: string): void => callback(repoPath)
    ipcRenderer.on('repo:changed', listener)
    return () => ipcRenderer.removeListener('repo:changed', listener)
  },
  diff: (repoPath: string, path: string, staged: boolean, untracked: boolean): Wrapped<string> =>
    ipcRenderer.invoke('git:diff', repoPath, path, staged, untracked),
  branches: (repoPath: string): Wrapped<import('../shared/types').BranchInfo[]> =>
    ipcRenderer.invoke('git:branches', repoPath),
  checkout: (repoPath: string, branch: string): Wrapped<void> =>
    ipcRenderer.invoke('git:checkout', repoPath, branch),
  createBranch: (repoPath: string, branch: string): Wrapped<void> =>
    ipcRenderer.invoke('git:create-branch', repoPath, branch),
  push: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:push', repoPath),
  pull: (repoPath: string): Wrapped<import('../shared/types').ConflictableResult> => ipcRenderer.invoke('git:pull', repoPath),
  log: (repoPath: string): Wrapped<import('../shared/types').CommitInfo[]> =>
    ipcRenderer.invoke('git:log', repoPath),
  graphLog: (repoPath: string, limit?: number): Wrapped<import('../shared/types').GraphCommit[]> =>
    ipcRenderer.invoke('git:graph-log', repoPath, limit),
  commitDetail: (repoPath: string, hash: string): Wrapped<import('../shared/types').CommitDetail> =>
    ipcRenderer.invoke('git:commit-detail', repoPath, hash),
  commitFileDiff: (
    repoPath: string,
    hash: string,
    path: string,
    ignoreWhitespace?: boolean
  ): Wrapped<string> =>
    ipcRenderer.invoke('git:commit-file-diff', repoPath, hash, path, ignoreWhitespace),
  stash: (repoPath: string, message?: string): Wrapped<void> => ipcRenderer.invoke('git:stash', repoPath, message),
  stashPop: (repoPath: string, ref?: string): Wrapped<void> => ipcRenderer.invoke('git:stash-pop', repoPath, ref),
  stashApply: (repoPath: string, ref: string): Wrapped<void> => ipcRenderer.invoke('git:stash-apply', repoPath, ref),
  stashDrop: (repoPath: string, ref: string): Wrapped<void> => ipcRenderer.invoke('git:stash-drop', repoPath, ref),
  stashes: (repoPath: string): Wrapped<import('../shared/types').StashEntry[]> =>
    ipcRenderer.invoke('git:stashes', repoPath),
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

  cherryPick: (repoPath: string, hash: string | string[]): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:cherry-pick', repoPath, hash),
  revertCommit: (repoPath: string, hash: string | string[]): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:revert-commit', repoPath, hash),

  operationState: (repoPath: string): Wrapped<import('../shared/types').OperationState | null> =>
    ipcRenderer.invoke('git:operation-state', repoPath),
  mergeBranch: (repoPath: string, branch: string): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:merge-branch', repoPath, branch),
  rebaseOnto: (repoPath: string, branch: string): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:rebase-onto', repoPath, branch),
  continueOperation: (repoPath: string, message?: string): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:continue-operation', repoPath, message),
  abortOperation: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:abort-operation', repoPath),
  skipOperation: (repoPath: string): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:skip-operation', repoPath),
  conflictFile: (repoPath: string, path: string): Wrapped<import('../shared/types').ConflictFileContent> =>
    ipcRenderer.invoke('git:conflict-file', repoPath, path),
  saveResolution: (repoPath: string, path: string, content: string, stage?: boolean): Wrapped<void> =>
    ipcRenderer.invoke('git:save-resolution', repoPath, path, content, stage),
  takeSide: (repoPath: string, path: string, side: 'current' | 'incoming' | 'base'): Wrapped<void> =>
    ipcRenderer.invoke('git:take-side', repoPath, path, side),
  resolveRename: (repoPath: string, path: string, keep: import('../shared/types').RenameKeep): Wrapped<void> =>
    ipcRenderer.invoke('git:resolve-rename', repoPath, path, keep),
  deleteConflictedFile: (repoPath: string, path: string): Wrapped<void> =>
    ipcRenderer.invoke('git:delete-conflicted-file', repoPath, path),
  markResolved: (repoPath: string, paths: string[]): Wrapped<void> =>
    ipcRenderer.invoke('git:mark-resolved', repoPath, paths),
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
  remotes: (repoPath: string): Wrapped<import('../shared/types').RepoRemote[]> =>
    ipcRenderer.invoke('git:remotes', repoPath),
  openPullRequests: (repoPath: string): Wrapped<import('../shared/types').OpenPullRequest[]> =>
    ipcRenderer.invoke('git:open-pull-requests', repoPath),
  checkoutRemoteBranch: (repoPath: string, name: string): Wrapped<void> =>
    ipcRenderer.invoke('git:checkout-remote-branch', repoPath, name),
  deleteBranch: (repoPath: string, name: string, force: boolean): Wrapped<void> =>
    ipcRenderer.invoke('git:delete-branch', repoPath, name, force),
  deleteRemoteBranch: (repoPath: string, name: string): Wrapped<void> =>
    ipcRenderer.invoke('git:delete-remote-branch', repoPath, name),
  renameBranch: (repoPath: string, from: string, to: string): Wrapped<void> =>
    ipcRenderer.invoke('git:rename-branch', repoPath, from, to),
  addWorktree: (repoPath: string, ref: string, kind: 'local' | 'remote' | 'commit'): Wrapped<string | null> =>
    ipcRenderer.invoke('git:add-worktree', repoPath, ref, kind),
  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write-text', text),

  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('settings:has-api-key'),
  listAccounts: (): Wrapped<import('../shared/accounts').ProviderAccount[]> => ipcRenderer.invoke('accounts:list'),
  /** Why tokens can't be stored securely here, or null when they can. */
  accountStorageProblem: (): Promise<string | null> => ipcRenderer.invoke('accounts:storage-problem'),
  addAccount: (input: import('../shared/accounts').NewAccountInput): Wrapped<import('../shared/accounts').ProviderAccount> =>
    ipcRenderer.invoke('accounts:add', input),
  removeAccount: (id: string): Wrapped<import('../shared/accounts').ProviderAccount[]> =>
    ipcRenderer.invoke('accounts:remove', id),
  getNotificationSettings: (): Promise<import('../shared/notifications').NotificationSettings> =>
    ipcRenderer.invoke('notifications:get-settings'),
  setNotificationSettings: (
    next: import('../shared/notifications').NotificationSettings
  ): Wrapped<import('../shared/notifications').NotificationSettings> =>
    ipcRenderer.invoke('notifications:set-settings', next),
  /** Shows a sample notification so the user can check the system lets SillyGit notify. */
  testNotification: (): Wrapped<void> => ipcRenderer.invoke('notifications:test'),
  getShowAvatars: (): Promise<boolean> => ipcRenderer.invoke('settings:get-show-avatars'),
  setShowAvatars: (show: boolean): Wrapped<void> => ipcRenderer.invoke('settings:set-show-avatars', show),
  /** Avatar images (data: URLs) by lower-cased email; null or missing means show initials. */
  resolveAvatars: (
    repoPath: string,
    requests: import('../shared/types').AvatarRequest[]
  ): Wrapped<Record<string, string | null>> => ipcRenderer.invoke('avatars:resolve', repoPath, requests),
  setApiKey: (key: string): Wrapped<void> => ipcRenderer.invoke('settings:set-api-key', key),
  quickSuggestMessages: (repoPath: string): Wrapped<import('../shared/quickActions').QuickMessage[]> =>
    ipcRenderer.invoke('quick:suggest-messages', repoPath),
  quickPackageVersion: (repoPath: string): Wrapped<string | null> =>
    ipcRenderer.invoke('quick:package-version', repoPath),
  quickBumpVersion: (
    repoPath: string,
    kind: import('../shared/quickActions').BumpKind
  ): Wrapped<import('../shared/quickActions').VersionBump> => ipcRenderer.invoke('quick:bump-version', repoPath, kind),
  quickPullRequestText: (
    repoPath: string,
    base: string,
    head: string,
    headBranch: string
  ): Wrapped<{ title: string; body: string }> =>
    ipcRenderer.invoke('quick:pull-request-text', repoPath, base, head, headBranch),
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
  getSession: (): Promise<import('../shared/types').SavedSession> => ipcRenderer.invoke('session:get'),
  recordOpenedRepo: (repoPath: string): Wrapped<string[]> => ipcRenderer.invoke('session:repo-opened', repoPath),
  forgetRecentRepo: (repoPath: string): Wrapped<string[]> => ipcRenderer.invoke('session:forget-repo', repoPath),
  saveLayout: (layout: Partial<import('../shared/types').SavedLayout>): Wrapped<void> =>
    ipcRenderer.invoke('session:save-layout', layout),
  getAutoFetchMinutes: (): Promise<number> => ipcRenderer.invoke('settings:get-auto-fetch'),
  setAutoFetchMinutes: (minutes: number): Wrapped<void> => ipcRenderer.invoke('settings:set-auto-fetch', minutes),
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
