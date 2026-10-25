import { app, shell, BrowserWindow, ipcMain, dialog, clipboard } from 'electron'
import { join } from 'path'
import { promises as fsp } from 'fs'
import * as git from './git'
import * as ai from './ai'
import * as settings from './settings'
import * as launchpad from './launchpad'
import * as diffSplit from '../shared/diffSplit'
import { registerTerminalHandlers, killAllTerminals } from './terminal'
import { registerClaudeHandlers, closeAllClaudeChats } from './claude'
import type { CommitSplitProposal, SplitGroupProposal } from '../shared/types'

let mainWindow: BrowserWindow | null = null

// When set, the window is never shown (still fully rendered, just not mapped
// to the screen) so a Playwright driver can automate it without disturbing
// the user's desktop. See .claude/skills/run-gitdesk.
const isE2E = process.env['GITDESK_E2E'] === '1'

const CONSOLE_LEVELS = ['LOG', 'WARN', 'ERROR', 'INFO', 'DEBUG']

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
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

  window.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const file = sourceId ? sourceId.split('/').pop() : ''
    console.log(`[renderer:${CONSOLE_LEVELS[level] ?? level}] ${message} (${file}:${line})`)
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

  ipcMain.handle('git:commit', (_e, repoPath: string, message: string) =>
    wrap(() => git.commit(repoPath, message))
  )

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

  ipcMain.handle('git:pull', (_e, repoPath: string) => wrap(() => git.pull(repoPath)))

  ipcMain.handle('git:log', (_e, repoPath: string) => wrap(() => git.getLog(repoPath)))

  ipcMain.handle('git:graph-log', (_e, repoPath: string) => wrap(() => git.getGraphLog(repoPath)))

  ipcMain.handle('git:commit-detail', (_e, repoPath: string, hash: string) =>
    wrap(() => git.getCommitDetail(repoPath, hash))
  )

  ipcMain.handle(
    'git:commit-file-diff',
    (_e, repoPath: string, hash: string, path: string, ignoreWhitespace?: boolean) =>
      wrap(() => git.getCommitFileDiff(repoPath, hash, path, ignoreWhitespace))
  )

  ipcMain.handle('git:stash', (_e, repoPath: string) => wrap(() => git.stash(repoPath)))

  ipcMain.handle('git:stash-pop', (_e, repoPath: string) => wrap(() => git.stashPop(repoPath)))

  ipcMain.handle('git:file-at-ref', (_e, repoPath: string, ref: string, path: string) =>
    wrap(() => git.getFileAtRef(repoPath, ref, path))
  )

  ipcMain.handle('git:working-file', (_e, repoPath: string, path: string) =>
    wrap(() => git.getWorkingFileContent(repoPath, path))
  )

  ipcMain.handle('git:blame', (_e, repoPath: string, ref: string, path: string) =>
    wrap(() => git.getBlame(repoPath, ref, path))
  )

  ipcMain.handle(
    'git:file-history',
    (_e, repoPath: string, path: string, fromRef: string, limit?: number) =>
      wrap(() => git.getFileHistory(repoPath, path, fromRef, limit))
  )

  ipcMain.handle('git:revert-hunk', (_e, repoPath: string, diffText: string, unitId: string) =>
    wrap(() => git.revertHunk(repoPath, diffText, unitId))
  )

  ipcMain.handle('git:cherry-pick', (_e, repoPath: string, hash: string) =>
    wrap(() => git.cherryPick(repoPath, hash))
  )

  ipcMain.handle('git:revert-commit', (_e, repoPath: string, hash: string) =>
    wrap(() => git.revertCommit(repoPath, hash))
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

  ipcMain.handle('settings:has-api-key', () => settings.hasStoredApiKey())

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
  registerIpcHandlers()
  createWindow()

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
