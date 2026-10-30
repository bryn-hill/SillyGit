import { app, ipcMain, dialog } from 'electron'
import { basename, join } from 'path'
import { promises as fsp } from 'fs'
import * as git from '../git'
import * as editFile from '../editFile'
import { activityLog } from '../gitExec'
import { watchRepo, stopWatching } from '../watcher'
import type { PartialAction } from '../../shared/lineStaging'
import type { PullMode } from '../../shared/types'
import type { CommitSearch, GraphFilter } from '../../shared/historySearch'
import { wrap } from './wrap'

/** Working tree, commits, history, stashes, remotes sync, tags and patches. */
export function registerGitHandlers(): void {
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

  ipcMain.handle('git:ignore', (_e, repoPath: string, pattern: string) =>
    wrap(() => git.addToGitignore(repoPath, pattern))
  )

  ipcMain.handle('git:commit', (_e, repoPath: string, message: string, amend?: boolean) =>
    wrap(() => git.commit(repoPath, message, !!amend))
  )

  ipcMain.handle('git:last-commit-message', (_e, repoPath: string) =>
    wrap(() => git.lastCommitMessage(repoPath))
  )

  ipcMain.handle('git:commit-hints', (_e, repoPath: string) => wrap(() => git.getCommitHints(repoPath)))

  ipcMain.handle('git:fetch', (_e, repoPath: string) => wrap(() => git.fetchAll(repoPath)))
  ipcMain.handle('git:fetch-remote', (_e, repoPath: string, name: string) => wrap(() => git.fetchRemote(repoPath, name)))
  ipcMain.handle('git:add-remote', (_e, repoPath: string, name: string, url: string) =>
    wrap(() => git.addRemote(repoPath, name, url))
  )
  ipcMain.handle('git:rename-remote', (_e, repoPath: string, name: string, newName: string) =>
    wrap(() => git.renameRemote(repoPath, name, newName))
  )
  ipcMain.handle('git:remove-remote', (_e, repoPath: string, name: string) => wrap(() => git.removeRemote(repoPath, name)))
  ipcMain.handle('git:set-remote-url', (_e, repoPath: string, name: string, url: string, push: boolean) =>
    wrap(() => git.setRemoteUrl(repoPath, name, url, push))
  )

  ipcMain.handle('git:undo-label', (_e, repoPath: string) => wrap(() => git.undoLabel(repoPath)))

  ipcMain.handle('git:undo', (_e, repoPath: string) => wrap(() => git.undo(repoPath)))

  ipcMain.handle('git:redo-label', (_e, repoPath: string) => wrap(() => git.redoLabel(repoPath)))

  ipcMain.handle('git:redo', (_e, repoPath: string) => wrap(() => git.redo(repoPath)))

  ipcMain.handle('git:reflog', (_e, repoPath: string, ref: string) => wrap(() => git.getReflog(repoPath, ref)))

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

  ipcMain.handle(
    'git:search-commits',
    (_e, repoPath: string, query: string | CommitSearch, filter?: GraphFilter | null) =>
      wrap(() => git.searchCommits(repoPath, query, undefined, filter ?? null))
  )

  ipcMain.handle('repo:watch', (e, repoPath: string | null) => {
    if (repoPath) watchRepo(e.sender, repoPath)
    else stopWatching(e.sender)
  })

  ipcMain.handle(
    'git:diff',
    (_e, repoPath: string, path: string, staged: boolean, untracked: boolean, ignoreWhitespace?: boolean) =>
      wrap(() => git.getDiff(repoPath, path, staged, untracked, ignoreWhitespace))
  )

  ipcMain.handle(
    'git:apply-partial',
    (_e, repoPath: string, diffText: string, unitId: string, lines: number[] | null, action: PartialAction) =>
      wrap(() => git.applyPartial(repoPath, diffText, unitId, lines, action))
  )

  ipcMain.handle('lfs:info', (_e, repoPath: string) => wrap(() => git.getLfsInfo(repoPath)))

  ipcMain.handle(
    'lfs:diff',
    (_e, repoPath: string, change: { hash: string | null; base?: string; staged: boolean; untracked: boolean; path: string; oldPath?: string }) =>
      wrap(() => git.getLfsDiff(repoPath, change))
  )

  ipcMain.handle('lfs:track', (_e, repoPath: string, pattern: string) => wrap(() => git.lfsTrack(repoPath, pattern)))

  ipcMain.handle('lfs:run', (_e, repoPath: string, command: 'fetch' | 'pull' | 'prune') =>
    wrap(() => git.lfsCommand(repoPath, command))
  )

  ipcMain.handle(
    'git:image-pair',
    (_e, repoPath: string, change: { hash: string | null; base?: string; staged: boolean; untracked: boolean; path: string; oldPath?: string }) =>
      wrap(() => git.getImagePair(repoPath, change))
  )
  ipcMain.handle('git:tags', (_e, repoPath: string) => wrap(() => git.listTags(repoPath)))
  ipcMain.handle('git:push-tag', (_e, repoPath: string, name: string) => wrap(() => git.pushTag(repoPath, name)))
  ipcMain.handle('git:delete-tag', (_e, repoPath: string, name: string, remote: boolean) =>
    wrap(() => git.deleteTag(repoPath, name, remote))
  )
  ipcMain.handle('git:worktrees', (_e, repoPath: string) => wrap(() => git.listWorktrees(repoPath)))
  ipcMain.handle('git:remove-worktree', (_e, repoPath: string, path: string, force: boolean) =>
    wrap(() => git.removeWorktree(repoPath, path, force))
  )
  ipcMain.handle('git:prune-worktrees', (_e, repoPath: string) => wrap(() => git.pruneWorktrees(repoPath)))
  ipcMain.handle('git:submodules', (_e, repoPath: string) => wrap(() => git.listSubmodules(repoPath)))
  ipcMain.handle('git:update-submodules', (_e, repoPath: string, path: string | null) =>
    wrap(() => git.updateSubmodules(repoPath, path))
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

  ipcMain.handle('git:graph-log', (_e, repoPath: string, limit?: number, filter?: GraphFilter | null) =>
    wrap(() => git.getGraphLog(repoPath, limit, filter ?? null))
  )

  ipcMain.handle('git:commit-detail', (_e, repoPath: string, hash: string) =>
    wrap(() => git.getCommitDetail(repoPath, hash))
  )

  ipcMain.handle('git:co-author-candidates', (_e, repoPath: string) => wrap(() => git.getCoAuthorCandidates(repoPath)))

  ipcMain.handle(
    'git:commit-file-diff',
    (_e, repoPath: string, hash: string, path: string, ignoreWhitespace?: boolean, oldPath?: string) =>
      wrap(() => git.getCommitFileDiff(repoPath, hash, path, ignoreWhitespace, oldPath))
  )

  ipcMain.handle('git:compare', (_e, repoPath: string, from: string, to: string) =>
    wrap(() => git.compareRefs(repoPath, from, to))
  )

  ipcMain.handle(
    'git:compare-file-diff',
    (_e, repoPath: string, fromHash: string, toHash: string, path: string, ignoreWhitespace?: boolean, oldPath?: string) =>
      wrap(() => git.getCompareFileDiff(repoPath, fromHash, toHash, path, ignoreWhitespace, oldPath))
  )

  ipcMain.handle('git:stash', (_e, repoPath: string, message?: string) => wrap(() => git.stash(repoPath, message)))

  ipcMain.handle('git:stash-pop', (_e, repoPath: string, ref?: string) => wrap(() => git.stashPop(repoPath, ref)))

  ipcMain.handle('git:stash-apply', (_e, repoPath: string, ref: string) => wrap(() => git.stashApply(repoPath, ref)))

  ipcMain.handle('git:stash-drop', (_e, repoPath: string, ref: string) => wrap(() => git.stashDrop(repoPath, ref)))

  ipcMain.handle('git:stashes', (_e, repoPath: string) => wrap(() => git.listStashes(repoPath)))

  ipcMain.handle('git:file-at-ref', (_e, repoPath: string, ref: string, path: string) =>
    wrap(() => git.getFileAtRef(repoPath, ref, path))
  )

  ipcMain.handle('git:tree', (_e, repoPath: string, ref: string) => wrap(() => git.listTreeAtRef(repoPath, ref)))

  ipcMain.handle('git:tree-file', (_e, repoPath: string, ref: string, path: string) =>
    wrap(() => git.readTreeFile(repoPath, ref, path))
  )

  // Resolves with the saved path, or null when the dialog was cancelled.
  ipcMain.handle('git:save-tree-file', (_e, repoPath: string, ref: string, path: string) =>
    wrap(async () => {
      const result = await dialog.showSaveDialog({ defaultPath: join(app.getPath('downloads'), basename(path)) })
      if (result.canceled || !result.filePath) return null
      await git.saveTreeFile(repoPath, ref, path, result.filePath)
      return result.filePath
    })
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
}
