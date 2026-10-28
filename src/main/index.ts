import { app, shell, BrowserWindow, ipcMain, dialog, clipboard, net, Notification } from 'electron'
import { basename, dirname, join } from 'path'
import { promises as fsp } from 'fs'
import * as git from './git'
import * as conflicts from './conflicts'
import * as mergeTool from './mergeTool'
import { parseConflictMarkers } from '../shared/conflicts'
import type { MergeToolSettings } from '../shared/mergeTools'
import * as editFile from './editFile'
import * as branches from './branches'
import * as ai from './ai'
import * as settings from './settings'
import * as launchpad from './launchpad'
import * as prReview from './prReview'
import * as quickActions from './quickActions'
import * as accounts from './accounts'
import * as github from './github'
import { AvatarResolver, type AvatarSources } from './avatars'
import { githubAccess, remoteLocations } from './hosting'
import { setFetch } from './http'
import { activityLog, setNetworkEnv } from './gitExec'
import { gitlabAvatarUrl } from './providerApi'
import { guessProvider, type NewAccountInput } from '../shared/accounts'
import * as diffSplit from '../shared/diffSplit'
import { registerTerminalHandlers, killAllTerminals } from './terminal'
import { registerClaudeHandlers, closeAllClaudeChats } from './claude'
import { watchRepo, stopWatching } from './watcher'
import { PrNotifier, type ShownNotification } from './prNotifications'
import type { NotificationSettings } from '../shared/notifications'
import type { SprintSettings } from '../shared/sprints'
import type { SubmitReviewInput } from '../shared/prReview'
import icon from '../../resources/icon.png?asset'
import claudeLogo from '../../resources/bots/claude.png?asset'
import renovateLogo from '../../resources/bots/renovate.png?asset'
import type { AvatarRequest, CommitSplitProposal, ConflictSnapshot, PullMode, RenameKeep, SavedLayout, SavedSession, SavedTabs, SplitGroupProposal } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let prNotifier: PrNotifier | null = null

// When set, the window is never shown (still fully rendered, just not mapped
// to the screen) so a Playwright driver can automate it without disturbing
// the user's desktop. See .claude/skills/run-sillygit.
const isE2E = process.env['SILLYGIT_E2E'] === '1'

const CONSOLE_LEVELS: Record<string, string> = { info: 'INFO', warning: 'WARN', error: 'ERROR', debug: 'DEBUG' }

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = window

  window.on('ready-to-show', () => {
    if (!isE2E) window.show()
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  window.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
    const file = sourceId ? sourceId.split('/').pop() : ''
    console.log(`[renderer:${CONSOLE_LEVELS[level] ?? level}] ${message} (${file}:${lineNumber})`)
  })

  window.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] process gone:', details.reason)
  })

  window.webContents.on('unresponsive', () => {
    console.error('[renderer] unresponsive')
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function wrap<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  return fn()
    .then((data) => ({ ok: true as const, data }))
    .catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }))
}

const MAX_REVIEW_CONTEXT_FILES = 20

// Fetches each changed file's full post-change content, for the AI review
// prompt. Skips deletions (nothing to fetch) and pure additions (the diff
// already contains the whole file, so fetching it again wastes prompt
// budget), and silently drops any file that fails to read (binary content,
// git errors) rather than failing the review over it.
async function fetchReviewFileContexts(
  repoPath: string,
  hash: string,
  files: { path: string; status: string }[]
): Promise<ai.FileContext[]> {
  const candidates = files
    .filter((f) => !f.status.startsWith('D') && !f.status.startsWith('A'))
    .slice(0, MAX_REVIEW_CONTEXT_FILES)

  const results = await Promise.all(
    candidates.map(async (f): Promise<ai.FileContext | null> => {
      try {
        const content = await git.getFileAtRef(repoPath, hash, f.path)
        if (content.includes('\u0000')) return null
        return { path: f.path, content }
      } catch {
        return null
      }
    })
  )

  return results.filter((r): r is ai.FileContext => r !== null)
}

let avatarResolver: AvatarResolver | null = null
let botLogos: Promise<AvatarSources['bots']> | null = null

/** The bundled Claude and Renovate logos, read once. */
function loadBotLogos(): Promise<AvatarSources['bots']> {
  const read = (file: string): Promise<string> =>
    fsp.readFile(file).then((data) => `data:image/png;base64,${data.toString('base64')}`)
  botLogos ??= Promise.all([read(claudeLogo), read(renovateLogo)])
    .then(([claude, renovate]) => ({ claude, renovate }))
    .catch(() => ({}))
  return botLogos
}

/** What the avatar lookup may use for a repo: signed-in accounts, its GitHub or GitLab remotes, Gravatar. */
async function avatarSources(repoPath: string): Promise<AvatarSources> {
  const signedIn = await accounts.listAccounts()
  const access = await githubAccess(repoPath).catch(() => null)
  // A host counts as GitLab when its signed-in account says so, or by name when none is.
  const isGitlab = (host: string): boolean => {
    const account = signedIn.find((a) => a.host === host)
    return account ? account.provider === 'gitlab' : guessProvider(host) === 'gitlab'
  }
  const gitlabHosts = [...new Set((await remoteLocations(repoPath)).map((l) => l.host).filter(isGitlab))]
  return {
    accounts: signedIn,
    bots: await loadBotLogos(),
    githubLookup: access ? (commits) => github.commitAuthorAvatars(access.creds, access.repo, commits) : undefined,
    gitlabLookup:
      gitlabHosts.length > 0
        ? async (email) => {
            for (const host of gitlabHosts) {
              const creds = (await accounts.credentialsFor(host, 'gitlab'))?.creds
              const url = await gitlabAvatarUrl(host, email, creds)
              if (url) return url
            }
            return null
          }
        : undefined,
    gravatar: true
  }
}

// Electron drops a notification's click handler if the object is garbage
// collected while it's still on screen, so each one is held until it goes.
const shownNotifications = new Set<Notification>()

function showNotification({ title, body, url }: ShownNotification): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title, body, icon })
  shownNotifications.add(notification)
  notification.on('click', () => {
    shownNotifications.delete(notification)
    if (url?.startsWith('https://')) void shell.openExternal(url)
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  notification.on('close', () => shownNotifications.delete(notification))
  notification.show()
}

/** GitHub repositories (owner/name) open in SillyGit whose remote is on `host`. */
async function watchedGithubRepos(host: string): Promise<string[]> {
  const [workspace, session] = await Promise.all([settings.getWorkspaceRepos(), settings.getLastSession()])
  const paths = [...new Set([...workspace, ...session.recentRepos])]
  const slugs: string[] = []
  for (const repoPath of paths) {
    for (const loc of await remoteLocations(repoPath)) {
      if (loc.host === host && loc.path.split('/').length === 2) slugs.push(loc.path)
    }
  }
  return slugs
}

function startPrNotifications(): void {
  prNotifier = new PrNotifier({
    settings: () => settings.getNotificationSettings(),
    accounts: () => accounts.accountsWithCredentials('github'),
    watchedRepos: watchedGithubRepos,
    show: showNotification,
    statePath: join(app.getPath('userData'), 'sillygit-notifications.json')
  })
  void prNotifier.restart()
}

function registerIpcHandlers(): void {
  ipcMain.handle('repo:open-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('repo:is-git-repo', (_e, repoPath: string) => git.isGitRepo(repoPath))

  ipcMain.handle('repo:init', (_e, repoPath: string) => wrap(() => git.initRepo(repoPath)))

  ipcMain.handle('git:status', (_e, repoPath: string) => wrap(() => git.getStatus(repoPath)))

  ipcMain.handle('git:stage', (_e, repoPath: string, paths: string[]) =>
    wrap(() => git.stageFiles(repoPath, paths))
  )

  ipcMain.handle('git:unstage', (_e, repoPath: string, paths: string[]) =>
    wrap(() => git.unstageFiles(repoPath, paths))
  )

  ipcMain.handle('git:stage-all', (_e, repoPath: string) => wrap(() => git.stageAll(repoPath)))

  ipcMain.handle('git:unstage-all', (_e, repoPath: string) => wrap(() => git.unstageAll(repoPath)))

  ipcMain.handle(
    'git:discard',
    (_e, repoPath: string, path: string, untracked: boolean) =>
      wrap(() => git.discardFile(repoPath, path, untracked))
  )

  ipcMain.handle('git:commit', (_e, repoPath: string, message: string, amend?: boolean) =>
    wrap(() => git.commit(repoPath, message, !!amend))
  )

  ipcMain.handle('git:last-commit-message', (_e, repoPath: string) =>
    wrap(() => git.lastCommitMessage(repoPath))
  )

  ipcMain.handle('git:fetch', (_e, repoPath: string) => wrap(() => git.fetchAll(repoPath)))

  ipcMain.handle('git:undo-label', (_e, repoPath: string) => wrap(() => git.undoLabel(repoPath)))

  ipcMain.handle('git:undo', (_e, repoPath: string) => wrap(() => git.undo(repoPath)))

  ipcMain.handle('git:redo-label', (_e, repoPath: string) => wrap(() => git.redoLabel(repoPath)))

  ipcMain.handle('git:redo', (_e, repoPath: string) => wrap(() => git.redo(repoPath)))

  ipcMain.handle('activity:list', () => activityLog())

  ipcMain.handle('git:apply-patch', (_e, repoPath: string) =>
    wrap(async () => {
      const result = await dialog.showOpenDialog({
        title: 'Apply patch',
        defaultPath: repoPath,
        properties: ['openFile'],
        filters: [
          { name: 'Patches', extensions: ['patch', 'diff'] },
          { name: 'All files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const file = result.filePaths[0]
      return { file: basename(file), ...(await git.applyPatch(repoPath, file)) }
    })
  )

  ipcMain.handle('git:clone', (_e, url: string) =>
    wrap(async () => {
      const result = await dialog.showOpenDialog({
        title: 'Choose where to clone',
        buttonLabel: 'Clone here',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return git.clone(url, result.filePaths[0])
    })
  )

  ipcMain.handle('git:search-commits', (_e, repoPath: string, query: string) =>
    wrap(() => git.searchCommits(repoPath, query))
  )

  ipcMain.handle('repo:watch', (e, repoPath: string | null) => {
    if (repoPath) watchRepo(e.sender, repoPath)
    else stopWatching(e.sender)
  })

  ipcMain.handle(
    'git:diff',
    (_e, repoPath: string, path: string, staged: boolean, untracked: boolean) =>
      wrap(() => git.getDiff(repoPath, path, staged, untracked))
  )

  ipcMain.handle('git:branches', (_e, repoPath: string) => wrap(() => git.listBranches(repoPath)))

  ipcMain.handle('git:checkout', (_e, repoPath: string, branch: string) =>
    wrap(() => git.checkoutBranch(repoPath, branch))
  )

  ipcMain.handle('git:create-branch', (_e, repoPath: string, branch: string) =>
    wrap(() => git.createBranch(repoPath, branch))
  )

  ipcMain.handle('git:push', (_e, repoPath: string) => wrap(() => git.push(repoPath)))

  ipcMain.handle('git:pull', (_e, repoPath: string, mode?: PullMode) => wrap(() => git.pull(repoPath, mode)))

  ipcMain.handle('git:log', (_e, repoPath: string) => wrap(() => git.getLog(repoPath)))

  ipcMain.handle('git:graph-log', (_e, repoPath: string, limit?: number) =>
    wrap(() => git.getGraphLog(repoPath, limit))
  )

  ipcMain.handle('git:commit-detail', (_e, repoPath: string, hash: string) =>
    wrap(() => git.getCommitDetail(repoPath, hash))
  )

  ipcMain.handle(
    'git:commit-file-diff',
    (_e, repoPath: string, hash: string, path: string, ignoreWhitespace?: boolean, oldPath?: string) =>
      wrap(() => git.getCommitFileDiff(repoPath, hash, path, ignoreWhitespace, oldPath))
  )

  ipcMain.handle('git:stash', (_e, repoPath: string, message?: string) => wrap(() => git.stash(repoPath, message)))

  ipcMain.handle('git:stash-pop', (_e, repoPath: string, ref?: string) => wrap(() => git.stashPop(repoPath, ref)))

  ipcMain.handle('git:stash-apply', (_e, repoPath: string, ref: string) => wrap(() => git.stashApply(repoPath, ref)))

  ipcMain.handle('git:stash-drop', (_e, repoPath: string, ref: string) => wrap(() => git.stashDrop(repoPath, ref)))

  ipcMain.handle('git:stashes', (_e, repoPath: string) => wrap(() => git.listStashes(repoPath)))

  ipcMain.handle('git:file-at-ref', (_e, repoPath: string, ref: string, path: string) =>
    wrap(() => git.getFileAtRef(repoPath, ref, path))
  )

  ipcMain.handle('git:working-file', (_e, repoPath: string, path: string) =>
    wrap(() => git.getWorkingFileContent(repoPath, path))
  )

  ipcMain.handle('file:read-editable', (_e, repoPath: string, path: string) =>
    wrap(() => editFile.readEditableFile(repoPath, path))
  )

  ipcMain.handle('file:write', (_e, repoPath: string, path: string, content: string) =>
    wrap(() => editFile.writeEditableFile(repoPath, path, content))
  )

  ipcMain.handle('git:blame', (_e, repoPath: string, ref: string | null, path: string) =>
    wrap(() => git.getBlame(repoPath, ref, path))
  )

  ipcMain.handle('git:tracked-files', (_e, repoPath: string) => wrap(() => git.listTrackedFiles(repoPath)))

  ipcMain.handle(
    'git:file-history',
    (_e, repoPath: string, path: string, fromRef: string, limit?: number) =>
      wrap(() => git.getFileHistory(repoPath, path, fromRef, limit))
  )

  ipcMain.handle('git:revert-hunk', (_e, repoPath: string, diffText: string, unitId: string) =>
    wrap(() => git.revertHunk(repoPath, diffText, unitId))
  )

  ipcMain.handle('git:cherry-pick', (_e, repoPath: string, hash: string | string[]) =>
    wrap(() => git.cherryPick(repoPath, hash))
  )

  ipcMain.handle('git:revert-commit', (_e, repoPath: string, hash: string | string[]) =>
    wrap(() => git.revertCommit(repoPath, hash))
  )

  ipcMain.handle('git:operation-state', (_e, repoPath: string) =>
    wrap(() => conflicts.getOperationState(repoPath))
  )

  ipcMain.handle('git:merge-branch', (_e, repoPath: string, branch: string) =>
    wrap(() => conflicts.mergeBranch(repoPath, branch))
  )

  ipcMain.handle('git:rebase-onto', (_e, repoPath: string, branch: string) =>
    wrap(() => conflicts.rebaseOnto(repoPath, branch))
  )

  ipcMain.handle('git:continue-operation', (_e, repoPath: string, message?: string) =>
    wrap(() => conflicts.continueOperation(repoPath, message))
  )

  ipcMain.handle('git:abort-operation', (_e, repoPath: string) =>
    wrap(() => conflicts.abortOperation(repoPath))
  )

  ipcMain.handle('git:skip-operation', (_e, repoPath: string) =>
    wrap(() => conflicts.skipOperation(repoPath))
  )

  ipcMain.handle('git:conflict-file', (_e, repoPath: string, path: string) =>
    wrap(() => conflicts.getConflictFile(repoPath, path))
  )

  ipcMain.handle('git:save-resolution', (_e, repoPath: string, path: string, content: string, stage?: boolean) =>
    wrap(() => conflicts.saveResolution(repoPath, path, content, stage))
  )

  ipcMain.handle('git:take-side', (_e, repoPath: string, path: string, side: 'current' | 'incoming' | 'base') =>
    wrap(() => conflicts.takeSide(repoPath, path, side))
  )

  ipcMain.handle('git:resolve-rename', (_e, repoPath: string, path: string, keep: RenameKeep) =>
    wrap(() => conflicts.resolveRename(repoPath, path, keep))
  )

  ipcMain.handle('git:delete-conflicted-file', (_e, repoPath: string, path: string) =>
    wrap(() => conflicts.deleteConflictedFile(repoPath, path))
  )

  ipcMain.handle('git:mark-resolved', (_e, repoPath: string, paths: string[]) =>
    wrap(() => conflicts.markResolved(repoPath, paths))
  )

  ipcMain.handle('git:take-side-many', (_e, repoPath: string, paths: string[], side: 'current' | 'incoming') =>
    wrap(() => conflicts.takeSideMany(repoPath, paths, side))
  )

  ipcMain.handle('git:restore-conflicts', (_e, repoPath: string, snapshot: ConflictSnapshot) =>
    wrap(() => conflicts.restoreConflicts(repoPath, snapshot))
  )

  ipcMain.handle('git:paths-with-markers', (_e, repoPath: string, paths: string[]) =>
    wrap(() => conflicts.pathsWithMarkers(repoPath, paths))
  )

  ipcMain.handle('git:open-in-merge-tool', (_e, repoPath: string, path: string) =>
    wrap(() => mergeTool.openInMergeTool(repoPath, path))
  )

  ipcMain.handle('ai:resolve-conflicts', (_e, repoPath: string, path: string) =>
    wrap(async () => {
      const file = await conflicts.getConflictFile(repoPath, path)
      if (file.kind !== 'text') throw new Error('Only text files can be resolved with AI.')
      return ai.resolveConflicts({
        path,
        currentLabel: file.currentLabel,
        incomingLabel: file.incomingLabel,
        segments: parseConflictMarkers(file.marked, file.markerSize)
      })
    })
  )

  ipcMain.handle(
    'git:reset-to',
    (_e, repoPath: string, hash: string, mode: 'soft' | 'mixed' | 'hard') =>
      wrap(() => git.resetTo(repoPath, hash, mode))
  )

  ipcMain.handle(
    'git:create-branch-at',
    (_e, repoPath: string, branch: string, startPoint: string, checkout?: boolean) =>
      wrap(() => git.createBranchAt(repoPath, branch, startPoint, checkout))
  )

  ipcMain.handle('git:create-tag', (_e, repoPath: string, name: string, hash: string) =>
    wrap(() => git.createTag(repoPath, name, hash))
  )

  ipcMain.handle(
    'git:create-annotated-tag',
    (_e, repoPath: string, name: string, message: string, hash: string) =>
      wrap(() => git.createAnnotatedTag(repoPath, name, message, hash))
  )

  ipcMain.handle('git:create-patch-file', (_e, repoPath: string, hash: string) =>
    wrap(async () => {
      const patch = await git.createPatchFromCommit(repoPath, hash)
      const result = await dialog.showSaveDialog({
        defaultPath: join(repoPath, `${hash.slice(0, 7)}.patch`)
      })
      if (result.canceled || !result.filePath) return
      await fsp.writeFile(result.filePath, patch, 'utf-8')
    })
  )

  ipcMain.handle('git:remotes', (_e, repoPath: string) => wrap(() => branches.listRepoRemotes(repoPath)))

  ipcMain.handle('git:open-pull-requests', (_e, repoPath: string) =>
    wrap(() => branches.listOpenPullRequests(repoPath))
  )

  ipcMain.handle('git:checkout-remote-branch', (_e, repoPath: string, name: string) =>
    wrap(() => branches.checkoutRemoteBranch(repoPath, name))
  )

  ipcMain.handle('git:delete-branch', (_e, repoPath: string, name: string, force: boolean) =>
    wrap(() => branches.deleteBranch(repoPath, name, force))
  )

  ipcMain.handle('git:delete-remote-branch', (_e, repoPath: string, name: string) =>
    wrap(() => branches.deleteRemoteBranch(repoPath, name))
  )

  ipcMain.handle('git:rename-branch', (_e, repoPath: string, from: string, to: string) =>
    wrap(() => branches.renameBranch(repoPath, from, to))
  )

  // Asks where to put the worktree (next to the repo by default), then adds it.
  // Resolves to the new worktree's path, or null when the dialog is cancelled.
  ipcMain.handle(
    'git:add-worktree',
    (_e, repoPath: string, ref: string, kind: 'local' | 'remote' | 'commit') =>
      wrap(async () => {
        const suffix = (kind === 'commit' ? ref.slice(0, 7) : ref).replace(/[^\w.-]+/g, '-')
        const result = await dialog.showSaveDialog({
          title: 'Create worktree',
          buttonLabel: 'Create worktree',
          defaultPath: join(dirname(repoPath), `${basename(repoPath)}-${suffix}`),
          properties: ['createDirectory', 'showOverwriteConfirmation']
        })
        if (result.canceled || !result.filePath) return null
        await branches.addWorktree(repoPath, result.filePath, ref, kind)
        return result.filePath
      })
  )

  ipcMain.handle('clipboard:write-text', (_e, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('shell:open-path', (_e, absolutePath: string) =>
    wrap(async () => {
      const result = await shell.openPath(absolutePath)
      if (result) throw new Error(result)
    })
  )

  ipcMain.handle('shell:open-external', (_e, url: string) =>
    wrap(async () => {
      if (!url.startsWith('https://')) throw new Error('Refusing to open a non-https URL.')
      await shell.openExternal(url)
    })
  )

  ipcMain.handle('launchpad:get-data', (_e, repoPaths: string[]) =>
    wrap(() => launchpad.getLaunchpadData(repoPaths))
  )

  ipcMain.handle('launchpad:merge-pr', (_e, repoPath: string, number: number) =>
    wrap(() => launchpad.mergePullRequest(repoPath, number))
  )

  ipcMain.handle('pr:get-detail', (_e, repoPath: string, number: number) =>
    wrap(() => prReview.getPullRequestDetail(repoPath, number))
  )

  ipcMain.handle('pr:submit-review', (_e, repoPath: string, number: number, input: SubmitReviewInput) =>
    wrap(() => prReview.submitReview(repoPath, number, input))
  )

  ipcMain.handle('pr:add-comment', (_e, repoPath: string, number: number, body: string) =>
    wrap(() => prReview.addComment(repoPath, number, body))
  )

  ipcMain.handle('pr:reply-to-thread', (_e, repoPath: string, threadId: string, body: string) =>
    wrap(() => prReview.replyToThread(repoPath, threadId, body))
  )

  ipcMain.handle('pr:set-thread-resolved', (_e, repoPath: string, threadId: string, resolved: boolean) =>
    wrap(() => prReview.setThreadResolved(repoPath, threadId, resolved))
  )

  ipcMain.handle('settings:get-workspace-repos', () => settings.getWorkspaceRepos())

  ipcMain.handle('settings:add-workspace-repo', (_e, repoPath: string) =>
    wrap(async () => {
      if (!(await git.isGitRepo(repoPath))) {
        throw new Error(`"${repoPath}" is not a git repository.`)
      }
      return settings.addWorkspaceRepo(repoPath)
    })
  )

  ipcMain.handle('settings:remove-workspace-repo', (_e, repoPath: string) =>
    wrap(() => settings.removeWorkspaceRepo(repoPath))
  )

  ipcMain.handle('session:get', async (): Promise<SavedSession> => {
    const { lastRepo, recentRepos, openTabs, pinnedTabs, layout } = await settings.getLastSession()
    const exists = await Promise.all(recentRepos.map((p) => git.isGitRepo(p)))
    const tabExists = await Promise.all(openTabs.map((p) => git.isGitRepo(p)))
    const lastRepoExists = !!lastRepo && (await git.isGitRepo(lastRepo))
    const tabs = openTabs.filter((_, i) => tabExists[i])
    return {
      // When the active tab's repo is gone, show the first tab still open.
      repoPath: lastRepoExists ? lastRepo : (tabs[0] ?? null),
      missingRepo: lastRepo && !lastRepoExists ? lastRepo : null,
      recentRepos: recentRepos.filter((_, i) => exists[i]),
      openTabs: lastRepoExists && !tabs.includes(lastRepo) ? [...tabs, lastRepo] : tabs,
      pinnedTabs: pinnedTabs.filter((p) => tabs.includes(p)),
      layout
    }
  })

  ipcMain.handle('session:repo-opened', (_e, repoPath: string) =>
    wrap(() => settings.recordOpenedRepo(repoPath))
  )

  ipcMain.handle('session:forget-repo', (_e, repoPath: string) =>
    wrap(() => settings.forgetRecentRepo(repoPath))
  )

  ipcMain.handle('session:save-tabs', (_e, tabs: SavedTabs) => wrap(() => settings.saveTabs(tabs)))

  ipcMain.handle('session:save-layout', (_e, layout: Partial<SavedLayout>) =>
    wrap(() => settings.saveLayout(layout))
  )

  ipcMain.handle('settings:has-api-key', () => settings.hasStoredApiKey())

  ipcMain.handle('settings:get-auto-fetch', () => settings.getAutoFetchMinutes())

  ipcMain.handle('settings:set-auto-fetch', (_e, minutes: number) =>
    wrap(() => settings.setAutoFetchMinutes(minutes))
  )

  ipcMain.handle('accounts:list', () => wrap(() => accounts.listAccounts()))

  ipcMain.handle('accounts:storage-problem', () => accounts.encryptionProblem())

  ipcMain.handle('accounts:add', (_e, input: NewAccountInput) =>
    wrap(async () => {
      const account = await accounts.addAccount(input)
      await avatarResolver?.forgetMisses()
      void prNotifier?.restart()
      return account
    })
  )

  ipcMain.handle('accounts:remove', (_e, id: string) => wrap(() => accounts.removeAccount(id)))

  ipcMain.handle('settings:get-merge-tool', () => settings.getMergeToolSettings())

  ipcMain.handle('settings:set-merge-tool', (_e, next: MergeToolSettings) =>
    wrap(() => settings.setMergeToolSettings(next))
  )

  ipcMain.handle('settings:get-sprints', () => settings.getSprintSettings())

  ipcMain.handle('settings:set-sprints', (_e, next: SprintSettings) => wrap(() => settings.setSprintSettings(next)))

  ipcMain.handle('notifications:get-settings', () => settings.getNotificationSettings())

  ipcMain.handle('notifications:set-settings', (_e, next: NotificationSettings) =>
    wrap(async () => {
      const saved = await settings.setNotificationSettings(next)
      await prNotifier?.restart()
      return saved
    })
  )

  ipcMain.handle('notifications:test', () =>
    wrap(async () => {
      if (!Notification.isSupported()) throw new Error('This system doesn\'t support desktop notifications.')
      showNotification({
        title: 'SillyGit notifications are working',
        body: 'You\'ll see pull request updates like this one.',
        url: null
      })
    })
  )

  ipcMain.handle('settings:get-show-avatars', () => settings.getShowAvatars())

  ipcMain.handle('settings:set-show-avatars', (_e, show: boolean) => wrap(() => settings.setShowAvatars(show)))

  ipcMain.handle('avatars:resolve', (_e, repoPath: string, requests: AvatarRequest[]) =>
    wrap(async () => {
      if (!(await settings.getShowAvatars())) return {}
      avatarResolver ??= new AvatarResolver(join(app.getPath('userData'), 'avatar-cache'))
      return avatarResolver.resolve(requests, await avatarSources(repoPath))
    })
  )

  ipcMain.handle('settings:set-api-key', (_e, key: string) => wrap(() => settings.setApiKey(key)))

  ipcMain.handle('ai:review-commit', (_e, repoPath: string, hash: string) =>
    wrap(async () => {
      const detail = await git.getCommitDetail(repoPath, hash)
      const diff = await git.getCommitFullDiff(repoPath, hash)
      const fileContexts = await fetchReviewFileContexts(repoPath, hash, detail.files)
      return ai.reviewCommit(detail.subject, detail.body, diff, fileContexts)
    })
  )

  ipcMain.handle('ai:review-file', (_e, repoPath: string, hash: string, path: string) =>
    wrap(async () => {
      const diff = await git.getCommitFileDiff(repoPath, hash, path)
      const fileContexts = await fetchReviewFileContexts(repoPath, hash, [{ path, status: 'M' }])
      return ai.reviewFile(path, diff, fileContexts)
    })
  )

  ipcMain.handle('quick:suggest-messages', (_e, repoPath: string) =>
    wrap(() => quickActions.suggestForStaged(repoPath))
  )

  ipcMain.handle('quick:package-version', (_e, repoPath: string) =>
    wrap(() => quickActions.getPackageVersion(repoPath))
  )

  ipcMain.handle('quick:bump-version', (_e, repoPath: string, kind: 'patch' | 'minor' | 'major') =>
    wrap(() => quickActions.bumpPackageVersion(repoPath, kind))
  )

  ipcMain.handle('quick:pull-request-text', (_e, repoPath: string, base: string, head: string, headBranch: string) =>
    wrap(() => quickActions.pullRequestText(repoPath, base, head, headBranch))
  )

  ipcMain.handle('ai:generate-commit-message', (_e, repoPath: string) =>
    wrap(async () => {
      const diff = await git.getStagedDiff(repoPath)
      if (!diff.trim()) {
        throw new Error('No staged changes to generate a message from.')
      }
      return ai.generateCommitMessage(diff)
    })
  )

  ipcMain.handle('ai:propose-split', (_e, repoPath: string, hash: string) =>
    wrap(async (): Promise<CommitSplitProposal> => {
      const headHash = await git.getHeadHash(repoPath)
      if (headHash !== hash) {
        throw new Error('Only the current HEAD commit can be split.')
      }
      if (!(await git.isWorkingTreeClean(repoPath))) {
        throw new Error('Working directory must be clean before splitting a commit.')
      }
      const detail = await git.getCommitDetail(repoPath, hash)
      if (detail.parents.length !== 1) {
        throw new Error('Only a commit with a single parent can be split (not a merge or root commit).')
      }
      const parentHash = detail.parents[0]
      const diffText = await git.getDiffForSplit(repoPath, parentHash, hash)
      const { units } = diffSplit.parseCommitDiff(diffText)
      if (units.length === 0) {
        throw new Error('This commit has no changes to split.')
      }

      const aiGroups = await ai.proposeCommitSplit(detail.subject, detail.body, units)
      diffSplit.validateGroupCoverage(units, aiGroups)

      const unitFile = new Map(units.map((u) => [u.id, u.file]))
      const groups: SplitGroupProposal[] = aiGroups.map((g) => ({
        message: g.message,
        unitIds: g.unitIds,
        files: [...new Set(g.unitIds.map((id) => unitFile.get(id)!))]
      }))

      return { headHash, parentHash, groups }
    })
  )

  ipcMain.handle('ai:apply-split', (_e, repoPath: string, proposal: CommitSplitProposal) =>
    wrap(async () => {
      const { headHash, parentHash, groups } = proposal
      if (groups.length === 0) throw new Error('No groups to apply.')

      const currentHead = await git.getHeadHash(repoPath)
      if (currentHead !== headHash) {
        throw new Error('HEAD has changed since the split was proposed. Please try again.')
      }

      const diffText = await git.getDiffForSplit(repoPath, parentHash, headHash)
      const { fileBlocks, units } = diffSplit.parseCommitDiff(diffText)
      diffSplit.validateGroupCoverage(units, groups)
      const expectedTreeHash = await git.getTreeHash(repoPath, headHash)

      const cumulativeIds = new Set<string>()
      const gitGroups = groups.map((g) => {
        for (const id of g.unitIds) cumulativeIds.add(id)
        return { message: g.message, patch: diffSplit.buildPatchForUnits(fileBlocks, cumulativeIds) }
      })

      await git.applyCommitSplit(repoPath, headHash, parentHash, expectedTreeHash, gitGroups)
    })
  )

  registerTerminalHandlers(() => mainWindow)
  registerClaudeHandlers(() => mainWindow)
}

app.whenReady().then(() => {
  // net.fetch goes through the system's proxy settings, like the rest of Chromium.
  setFetch((url, init) => net.fetch(url, init))
  setNetworkEnv(accounts.gitAuthEnv)
  registerIpcHandlers()
  // Packaged macOS builds take the icon from the bundle; dev runs need it set here.
  if (!app.isPackaged) app.dock?.setIcon(icon)
  createWindow()
  if (!isE2E) startPrNotifications()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllTerminals()
  closeAllClaudeChats()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAllTerminals()
  closeAllClaudeChats()
})

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})
