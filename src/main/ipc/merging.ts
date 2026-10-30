import { ipcMain } from 'electron'
import * as conflicts from '../conflicts'
import * as mergeTool from '../mergeTool'
import { parseConflictMarkers } from '../../shared/conflicts'
import * as fixup from '../fixup'
import * as rebase from '../rebase'
import * as bisect from '../bisect'
import type { BisectVerdict } from '../../shared/bisect'
import * as refDrop from '../refDrop'
import * as ai from '../ai'
import type { RebaseStep } from '../../shared/rebase'
import type { MergeStrategy } from '../../shared/mergeOptions'
import type { ConflictSnapshot, RenameKeep } from '../../shared/types'
import { wrap } from './wrap'

/** Merges, rebases (plain and interactive), cherry-picks, bisects, drag-and-drop onto branches, and resolving their conflicts. */
export function registerMergeHandlers(): void {
  ipcMain.handle('git:operation-state', (_e, repoPath: string) =>
    wrap(() => conflicts.getOperationState(repoPath))
  )

  ipcMain.handle('git:bisect-state', (_e, repoPath: string) => wrap(() => conflicts.getBisectState(repoPath)))

  ipcMain.handle('git:bisect-start', (_e, repoPath: string, hash: string, verdict: 'bad' | 'good') =>
    wrap(() => bisect.startBisect(repoPath, hash, verdict))
  )

  ipcMain.handle('git:bisect-mark', (_e, repoPath: string, verdict: BisectVerdict, hash?: string) =>
    wrap(() => bisect.markBisect(repoPath, verdict, hash))
  )

  ipcMain.handle('git:bisect-reset', (_e, repoPath: string) => wrap(() => bisect.resetBisect(repoPath)))

  ipcMain.handle('git:merge-branch', (_e, repoPath: string, branch: string, strategy?: MergeStrategy) =>
    wrap(() => conflicts.mergeBranch(repoPath, branch, strategy))
  )

  ipcMain.handle('git:rebase-onto', (_e, repoPath: string, branch: string) =>
    wrap(() => conflicts.rebaseOnto(repoPath, branch))
  )

  ipcMain.handle('git:plan-interactive-rebase', (_e, repoPath: string, base: string) =>
    wrap(() => rebase.planInteractiveRebase(repoPath, base))
  )

  ipcMain.handle(
    'git:start-interactive-rebase',
    (_e, repoPath: string, base: string, expectedHead: string, steps: RebaseStep[]) =>
      wrap(() => rebase.startInteractiveRebase(repoPath, base, expectedHead, steps))
  )

  ipcMain.handle('git:fixup-into', (_e, repoPath: string, target: string) =>
    wrap(() => fixup.fixupInto(repoPath, target))
  )

  ipcMain.handle('git:plan-absorb', (_e, repoPath: string) => wrap(() => fixup.planAbsorb(repoPath)))

  ipcMain.handle(
    'git:absorb',
    (_e, repoPath: string, planHead: string, planDiff: string, assignments: Record<string, string>) =>
      wrap(() => fixup.absorb(repoPath, planHead, planDiff, assignments))
  )

  ipcMain.handle('git:drop-relation', (_e, repoPath: string, source: string, target: string) =>
    wrap(() => refDrop.dropRelation(repoPath, source, target))
  )

  ipcMain.handle('git:merge-into', (_e, repoPath: string, source: string, target: string, strategy?: MergeStrategy) =>
    wrap(() => refDrop.mergeInto(repoPath, source, target, strategy))
  )

  ipcMain.handle('git:rebase-branch-onto', (_e, repoPath: string, branch: string, onto: string) =>
    wrap(() => refDrop.rebaseBranchOnto(repoPath, branch, onto))
  )

  ipcMain.handle('git:fast-forward', (_e, repoPath: string, target: string, source: string) =>
    wrap(() => refDrop.fastForward(repoPath, target, source))
  )

  ipcMain.handle('git:cherry-pick-onto', (_e, repoPath: string, hashes: string[], target: string) =>
    wrap(() => refDrop.cherryPickOnto(repoPath, hashes, target))
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
}
