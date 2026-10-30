import { ipcMain, dialog } from 'electron'
import { basename, dirname, join } from 'path'
import * as branches from '../branches'
import * as stacks from '../stacks'
import type { DeletedBranch } from '../../shared/branchCleanup'
import { wrap } from './wrap'

/** Remotes, remote branches, open pull requests, branch cleanup and worktrees. */
export function registerBranchHandlers(): void {
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

  ipcMain.handle('git:cleanup-candidates', (_e, repoPath: string) =>
    wrap(() => branches.listCleanupCandidates(repoPath))
  )

  ipcMain.handle('git:delete-branches', (_e, repoPath: string, names: string[]) =>
    wrap(() => branches.deleteBranches(repoPath, names))
  )

  ipcMain.handle('git:restore-branches', (_e, repoPath: string, deleted: DeletedBranch[]) =>
    wrap(() => branches.restoreBranches(repoPath, deleted))
  )

  ipcMain.handle('git:delete-remote-branch', (_e, repoPath: string, name: string) =>
    wrap(() => branches.deleteRemoteBranch(repoPath, name))
  )

  ipcMain.handle('git:pull-branch', (_e, repoPath: string, name: string) =>
    wrap(() => branches.pullBranch(repoPath, name))
  )

  ipcMain.handle('git:rename-branch', (_e, repoPath: string, from: string, to: string) =>
    wrap(() => branches.renameBranch(repoPath, from, to))
  )

  ipcMain.handle('git:stacks', (_e, repoPath: string) => wrap(() => stacks.listStacks(repoPath)))

  ipcMain.handle('git:set-stack-parent', (_e, repoPath: string, branch: string, parent: string | null) =>
    wrap(() => stacks.setStackParent(repoPath, branch, parent))
  )

  ipcMain.handle('git:create-stacked-branch', (_e, repoPath: string, parent: string, name: string) =>
    wrap(() => stacks.createStackedBranch(repoPath, parent, name))
  )

  ipcMain.handle('git:restack', (_e, repoPath: string, branch: string) => wrap(() => stacks.restack(repoPath, branch)))

  ipcMain.handle('git:push-stack', (_e, repoPath: string, branch: string) => wrap(() => stacks.pushStack(repoPath, branch)))

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
}
