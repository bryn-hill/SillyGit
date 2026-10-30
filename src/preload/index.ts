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
  redoLabel: (repoPath: string): Wrapped<string | null> => ipcRenderer.invoke('git:redo-label', repoPath),
  redo: (repoPath: string): Wrapped<string> => ipcRenderer.invoke('git:redo', repoPath),
  /** Where SillyGit's own checkout stands against origin/main, and the update step running, if any. */
  selfUpdateStatus: (): Promise<{
    status: import('../shared/selfUpdate').SelfUpdateStatus
    step: import('../shared/selfUpdate').SelfUpdateStep | null
  }> => ipcRenderer.invoke('self-update:status'),
  /** Fetches origin/main for SillyGit's own checkout. */
  checkSelfUpdate: (): Wrapped<import('../shared/selfUpdate').SelfUpdateStatus> => ipcRenderer.invoke('self-update:check'),
  /** Pulls the latest main into SillyGit's checkout, installs, rebuilds and restarts the app. */
  applySelfUpdate: (): Wrapped<import('../shared/selfUpdate').SelfUpdateResult> => ipcRenderer.invoke('self-update:apply'),
  onSelfUpdateChanged: (
    callback: (
      status: import('../shared/selfUpdate').SelfUpdateStatus,
      step: import('../shared/selfUpdate').SelfUpdateStep | null
    ) => void
  ): (() => void) => {
    const listener = (
      _e: unknown,
      status: import('../shared/selfUpdate').SelfUpdateStatus,
      step: import('../shared/selfUpdate').SelfUpdateStep | null
    ): void => callback(status, step)
    ipcRenderer.on('self-update:changed', listener)
    return () => ipcRenderer.removeListener('self-update:changed', listener)
  },
  activityLog: (): Promise<import('../shared/activity').ActivityEntry[]> => ipcRenderer.invoke('activity:list'),
  /** Asks for a patch file and applies it; null when the dialog was cancelled. */
  applyPatch: (
    repoPath: string
  ): Wrapped<({ file: string } & import('../shared/types').ConflictableResult) | null> =>
    ipcRenderer.invoke('git:apply-patch', repoPath),
  /** Asks where to clone `url` and clones it there, returning the new repo's path; null when cancelled. */
  clone: (url: string): Wrapped<string | null> => ipcRenderer.invoke('git:clone', url),
  searchCommits: (repoPath: string, query: string): Wrapped<import('../shared/types').CommitSearchHit[]> =>
    ipcRenderer.invoke('git:search-commits', repoPath, query),
  /** Starts watching `repoPath` for outside changes (null stops); see onRepoChanged. */
  watchRepo: (repoPath: string | null): Promise<void> => ipcRenderer.invoke('repo:watch', repoPath),
  onRepoChanged: (callback: (repoPath: string) => void): (() => void) => {
    const listener = (_e: unknown, repoPath: string): void => callback(repoPath)
    ipcRenderer.on('repo:changed', listener)
    return () => ipcRenderer.removeListener('repo:changed', listener)
  },
  diff: (repoPath: string, path: string, staged: boolean, untracked: boolean, ignoreWhitespace?: boolean): Wrapped<string> =>
    ipcRenderer.invoke('git:diff', repoPath, path, staged, untracked, ignoreWhitespace),
  /** Stages, unstages or discards one hunk of `diffText`, or just the given lines of it. */
  applyPartial: (
    repoPath: string,
    diffText: string,
    unitId: string,
    lines: number[] | null,
    action: import('../shared/lineStaging').PartialAction
  ): Wrapped<void> => ipcRenderer.invoke('git:apply-partial', repoPath, diffText, unitId, lines, action),
  /** Both versions of an image file a change compares, for the image diff. */
  imagePair: (
    repoPath: string,
    change: { hash: string | null; staged: boolean; untracked: boolean; path: string; oldPath?: string }
  ): Wrapped<import('../shared/imageDiff').ImagePair> => ipcRenderer.invoke('git:image-pair', repoPath, change),
  tags: (repoPath: string): Wrapped<import('../shared/types').TagInfo[]> => ipcRenderer.invoke('git:tags', repoPath),
  pushTag: (repoPath: string, name: string): Wrapped<void> => ipcRenderer.invoke('git:push-tag', repoPath, name),
  /** Deletes a tag here, and from the remote too when `remote` is set. */
  deleteTag: (repoPath: string, name: string, remote: boolean): Wrapped<void> =>
    ipcRenderer.invoke('git:delete-tag', repoPath, name, remote),
  worktrees: (repoPath: string): Wrapped<import('../shared/types').WorktreeInfo[]> =>
    ipcRenderer.invoke('git:worktrees', repoPath),
  removeWorktree: (repoPath: string, path: string, force: boolean): Wrapped<void> =>
    ipcRenderer.invoke('git:remove-worktree', repoPath, path, force),
  pruneWorktrees: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:prune-worktrees', repoPath),
  submodules: (repoPath: string): Wrapped<import('../shared/types').SubmoduleInfo[]> =>
    ipcRenderer.invoke('git:submodules', repoPath),
  /** Updates one submodule, or all of them when `path` is null. */
  updateSubmodules: (repoPath: string, path: string | null): Wrapped<void> =>
    ipcRenderer.invoke('git:update-submodules', repoPath, path),
  branches: (repoPath: string): Wrapped<import('../shared/types').BranchInfo[]> =>
    ipcRenderer.invoke('git:branches', repoPath),
  checkout: (repoPath: string, branch: string): Wrapped<void> =>
    ipcRenderer.invoke('git:checkout', repoPath, branch),
  createBranch: (repoPath: string, branch: string): Wrapped<void> =>
    ipcRenderer.invoke('git:create-branch', repoPath, branch),
  push: (repoPath: string): Wrapped<void> => ipcRenderer.invoke('git:push', repoPath),
  pull: (
    repoPath: string,
    mode?: import('../shared/types').PullMode
  ): Wrapped<import('../shared/types').ConflictableResult> => ipcRenderer.invoke('git:pull', repoPath, mode),
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
    ignoreWhitespace?: boolean,
    oldPath?: string
  ): Wrapped<string> =>
    ipcRenderer.invoke('git:commit-file-diff', repoPath, hash, path, ignoreWhitespace, oldPath),
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
  readEditableFile: (repoPath: string, path: string): Wrapped<import('../shared/types').EditableFile> =>
    ipcRenderer.invoke('file:read-editable', repoPath, path),
  writeFile: (repoPath: string, path: string, content: string): Wrapped<void> =>
    ipcRenderer.invoke('file:write', repoPath, path, content),
  /** A null `ref` blames the working-tree file, uncommitted lines included. */
  blame: (repoPath: string, ref: string | null, path: string): Wrapped<import('../shared/types').BlameLine[]> =>
    ipcRenderer.invoke('git:blame', repoPath, ref, path),
  trackedFiles: (repoPath: string): Wrapped<string[]> => ipcRenderer.invoke('git:tracked-files', repoPath),
  fileHistory: (
    repoPath: string,
    path: string,
    fromRef: string,
    limit?: number
  ): Wrapped<import('../shared/types').FileHistoryEntry[]> =>
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
  planInteractiveRebase: (repoPath: string, base: string): Wrapped<import('../shared/rebase').RebasePlan> =>
    ipcRenderer.invoke('git:plan-interactive-rebase', repoPath, base),
  startInteractiveRebase: (
    repoPath: string,
    base: string,
    expectedHead: string,
    steps: import('../shared/rebase').RebaseStep[]
  ): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:start-interactive-rebase', repoPath, base, expectedHead, steps),
  /** Commits what's staged as a fixup of `target` and squashes it in. */
  fixupInto: (repoPath: string, target: string): Wrapped<import('../shared/types').FixupResult> =>
    ipcRenderer.invoke('git:fixup-into', repoPath, target),
  /** Which earlier commit each staged hunk belongs in. */
  planAbsorb: (repoPath: string): Wrapped<import('../shared/absorb').AbsorbPlan> =>
    ipcRenderer.invoke('git:plan-absorb', repoPath),
  /** Folds staged hunks into the commits `assignments` maps them to (unit id to hash). */
  absorb: (
    repoPath: string,
    planHead: string,
    planDiff: string,
    assignments: Record<string, string>
  ): Wrapped<import('../shared/types').FixupResult> =>
    ipcRenderer.invoke('git:absorb', repoPath, planHead, planDiff, assignments),
  dropRelation: (repoPath: string, source: string, target: string): Wrapped<import('../shared/types').DropRelation> =>
    ipcRenderer.invoke('git:drop-relation', repoPath, source, target),
  mergeInto: (repoPath: string, source: string, target: string): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:merge-into', repoPath, source, target),
  rebaseBranchOnto: (repoPath: string, branch: string, onto: string): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:rebase-branch-onto', repoPath, branch, onto),
  fastForward: (repoPath: string, target: string, source: string): Wrapped<void> =>
    ipcRenderer.invoke('git:fast-forward', repoPath, target, source),
  cherryPickOnto: (repoPath: string, hashes: string[], target: string): Wrapped<import('../shared/types').ConflictableResult> =>
    ipcRenderer.invoke('git:cherry-pick-onto', repoPath, hashes, target),
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
  markResolved: (repoPath: string, paths: string[]): Wrapped<import('../shared/types').ConflictSnapshot> =>
    ipcRenderer.invoke('git:mark-resolved', repoPath, paths),
  takeSideMany: (
    repoPath: string,
    paths: string[],
    side: 'current' | 'incoming'
  ): Wrapped<import('../shared/types').ConflictSnapshot> => ipcRenderer.invoke('git:take-side-many', repoPath, paths, side),
  restoreConflicts: (repoPath: string, snapshot: import('../shared/types').ConflictSnapshot): Wrapped<void> =>
    ipcRenderer.invoke('git:restore-conflicts', repoPath, snapshot),
  pathsWithMarkers: (repoPath: string, paths: string[]): Wrapped<string[]> =>
    ipcRenderer.invoke('git:paths-with-markers', repoPath, paths),
  openInMergeTool: (repoPath: string, path: string): Wrapped<import('../shared/types').MergeToolResult> =>
    ipcRenderer.invoke('git:open-in-merge-tool', repoPath, path),
  aiResolveConflicts: (repoPath: string, path: string): Wrapped<import('../shared/types').AiConflictResolution> =>
    ipcRenderer.invoke('ai:resolve-conflicts', repoPath, path),
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
  cleanupCandidates: (repoPath: string): Wrapped<import('../shared/branchCleanup').CleanupCandidate[]> =>
    ipcRenderer.invoke('git:cleanup-candidates', repoPath),
  deleteBranches: (
    repoPath: string,
    names: string[]
  ): Wrapped<{ deleted: import('../shared/branchCleanup').DeletedBranch[]; failed: { name: string; error: string }[] }> =>
    ipcRenderer.invoke('git:delete-branches', repoPath, names),
  restoreBranches: (repoPath: string, deleted: import('../shared/branchCleanup').DeletedBranch[]): Wrapped<void> =>
    ipcRenderer.invoke('git:restore-branches', repoPath, deleted),
  deleteRemoteBranch: (repoPath: string, name: string): Wrapped<void> =>
    ipcRenderer.invoke('git:delete-remote-branch', repoPath, name),
  pullBranch: (repoPath: string, name: string): Wrapped<{ updated: boolean }> =>
    ipcRenderer.invoke('git:pull-branch', repoPath, name),
  /** The repo's stacked branches. */
  stacks: (repoPath: string): Wrapped<import('../shared/stacks').StackInfo[]> => ipcRenderer.invoke('git:stacks', repoPath),
  /** Stacks `branch` on `parent`, or takes it out of its stack when `parent` is null. */
  setStackParent: (repoPath: string, branch: string, parent: string | null): Wrapped<void> =>
    ipcRenderer.invoke('git:set-stack-parent', repoPath, branch, parent),
  createStackedBranch: (repoPath: string, parent: string, name: string): Wrapped<void> =>
    ipcRenderer.invoke('git:create-stacked-branch', repoPath, parent, name),
  /** Rebases every branch in `branch`'s stack onto its parent. */
  restack: (repoPath: string, branch: string): Wrapped<import('../shared/stacks').RestackResult> =>
    ipcRenderer.invoke('git:restack', repoPath, branch),
  pushStack: (repoPath: string, branch: string): Wrapped<{ remote: string; pushed: string[] }> =>
    ipcRenderer.invoke('git:push-stack', repoPath, branch),
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
  getMergeToolSettings: (): Promise<import('../shared/mergeTools').MergeToolSettings> =>
    ipcRenderer.invoke('settings:get-merge-tool'),
  setMergeToolSettings: (
    next: import('../shared/mergeTools').MergeToolSettings
  ): Wrapped<import('../shared/mergeTools').MergeToolSettings> => ipcRenderer.invoke('settings:set-merge-tool', next),
  getCustomCommands: (): Promise<import('../shared/customCommands').CustomCommand[]> =>
    ipcRenderer.invoke('settings:get-custom-commands'),
  setCustomCommands: (
    next: import('../shared/customCommands').CustomCommand[]
  ): Wrapped<import('../shared/customCommands').CustomCommand[]> => ipcRenderer.invoke('settings:set-custom-commands', next),
  getSprintSettings: (): Promise<import('../shared/sprints').SprintSettings> =>
    ipcRenderer.invoke('settings:get-sprints'),
  setSprintSettings: (
    next: import('../shared/sprints').SprintSettings
  ): Wrapped<import('../shared/sprints').SprintSettings> => ipcRenderer.invoke('settings:set-sprints', next),
  getBranchListSettings: (): Promise<import('../shared/branchStatus').BranchListSettings> =>
    ipcRenderer.invoke('settings:get-branch-list'),
  setBranchListSettings: (
    next: import('../shared/branchStatus').BranchListSettings
  ): Wrapped<import('../shared/branchStatus').BranchListSettings> => ipcRenderer.invoke('settings:set-branch-list', next),
  getFavouriteBranches: (repoPath: string): Promise<string[]> => ipcRenderer.invoke('branches:get-favourites', repoPath),
  setFavouriteBranches: (repoPath: string, names: string[]): Wrapped<void> =>
    ipcRenderer.invoke('branches:set-favourites', repoPath, names),
  /** When the "can be tidied" banner may show again, in ms, or null when it isn't snoozed. */
  getCleanupSnooze: (repoPath: string): Promise<number | null> => ipcRenderer.invoke('branches:get-cleanup-snooze', repoPath),
  setCleanupSnooze: (repoPath: string, until: number | null): Wrapped<void> =>
    ipcRenderer.invoke('branches:set-cleanup-snooze', repoPath, until),
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
  getMergeAnimation: (): Promise<boolean> => ipcRenderer.invoke('settings:get-merge-animation'),
  setMergeAnimation: (on: boolean): Wrapped<void> => ipcRenderer.invoke('settings:set-merge-animation', on),
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
  prGetDetail: (repoPath: string, number: number): Wrapped<import('../shared/prReview').PullRequestDetail> =>
    ipcRenderer.invoke('pr:get-detail', repoPath, number),
  prSubmitReview: (repoPath: string, number: number, input: import('../shared/prReview').SubmitReviewInput): Wrapped<void> =>
    ipcRenderer.invoke('pr:submit-review', repoPath, number, input),
  prAddComment: (repoPath: string, number: number, body: string): Wrapped<void> =>
    ipcRenderer.invoke('pr:add-comment', repoPath, number, body),
  prReplyToThread: (repoPath: string, threadId: string, body: string): Wrapped<void> =>
    ipcRenderer.invoke('pr:reply-to-thread', repoPath, threadId, body),
  prSetThreadResolved: (repoPath: string, threadId: string, resolved: boolean): Wrapped<void> =>
    ipcRenderer.invoke('pr:set-thread-resolved', repoPath, threadId, resolved),
  prCreate: (
    repoPath: string,
    input: import('../shared/createPullRequest').CreatePullRequestInput
  ): Wrapped<import('../shared/createPullRequest').CreatedPullRequest> => ipcRenderer.invoke('pr:create', repoPath, input),
  /** People who can be asked to review a new pull request in the repo. */
  prSuggestedReviewers: (repoPath: string): Wrapped<string[]> => ipcRenderer.invoke('pr:suggested-reviewers', repoPath),
  /** Pushes a local branch, checked out or not, to `remote`; returns its name there. */
  pushBranch: (repoPath: string, branch: string, remote: string): Wrapped<string> =>
    ipcRenderer.invoke('git:push-branch', repoPath, branch, remote),
  getSession: (): Promise<import('../shared/types').SavedSession> => ipcRenderer.invoke('session:get'),
  recordOpenedRepo: (repoPath: string): Wrapped<string[]> => ipcRenderer.invoke('session:repo-opened', repoPath),
  forgetRecentRepo: (repoPath: string): Wrapped<string[]> => ipcRenderer.invoke('session:forget-repo', repoPath),
  saveTabs: (tabs: import('../shared/types').SavedTabs): Wrapped<void> => ipcRenderer.invoke('session:save-tabs', tabs),
  saveLayout: (layout: Partial<import('../shared/types').SavedLayout>): Wrapped<void> =>
    ipcRenderer.invoke('session:save-layout', layout),
  getAutoFetchMinutes: (): Promise<number> => ipcRenderer.invoke('settings:get-auto-fetch'),
  setAutoFetchMinutes: (minutes: number): Wrapped<void> => ipcRenderer.invoke('settings:set-auto-fetch', minutes),
  getRunCommand: (repoPath: string): Promise<{ command: string | null; suggestion: string }> =>
    ipcRenderer.invoke('run:get-command', repoPath),
  setRunCommand: (repoPath: string, command: string): Wrapped<void> =>
    ipcRenderer.invoke('run:set-command', repoPath, command),
  /** Gets a Run ready: checks out `commit` in the run checkout when it isn't a clean HEAD. */
  planRun: (repoPath: string, commit: string | null): Wrapped<import('../shared/run').RunPlan> =>
    ipcRenderer.invoke('run:plan', repoPath, commit),
  getWorkspaceRepos: (): Promise<string[]> => ipcRenderer.invoke('settings:get-workspace-repos'),
  addWorkspaceRepo: (repoPath: string): Wrapped<string[]> =>
    ipcRenderer.invoke('settings:add-workspace-repo', repoPath),
  removeWorkspaceRepo: (repoPath: string): Wrapped<string[]> =>
    ipcRenderer.invoke('settings:remove-workspace-repo', repoPath),

  /** Opens a shell, or, with `command`, runs that command in a shell that exits when it does. */
  terminalCreate: (cwd: string | undefined, cols: number, rows: number, command?: string): Promise<number> =>
    ipcRenderer.invoke('terminal:create', cwd, cols, rows, command),
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
