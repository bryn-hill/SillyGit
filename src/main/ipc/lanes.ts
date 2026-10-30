import { ipcMain } from 'electron'
import * as lanes from '../lanes'
import type { LaneMove } from '../../shared/lanes'
import { wrap } from './wrap'

/** Lanes (virtual branches): several branches applied to one working tree. */
export function registerLaneHandlers(): void {
  ipcMain.handle('lanes:status', (_e, repoPath: string) => wrap(() => lanes.lanesStatus(repoPath)))

  ipcMain.handle('lanes:enter', (_e, repoPath: string, base: string, lane: string) =>
    wrap(() => lanes.enterLanes(repoPath, base, lane))
  )

  ipcMain.handle('lanes:leave', (_e, repoPath: string, keep: string) => wrap(() => lanes.leaveLanes(repoPath, keep)))

  ipcMain.handle('lanes:forget', (_e, repoPath: string) => wrap(() => lanes.forgetLanes(repoPath)))

  ipcMain.handle('lanes:return', (_e, repoPath: string) => wrap(() => lanes.returnToWorkspace(repoPath)))

  ipcMain.handle('lanes:create', (_e, repoPath: string, name: string) => wrap(() => lanes.createLane(repoPath, name)))

  ipcMain.handle('lanes:apply', (_e, repoPath: string, name: string) => wrap(() => lanes.applyLane(repoPath, name)))

  ipcMain.handle('lanes:unapply', (_e, repoPath: string, name: string, remove: boolean) =>
    wrap(() => lanes.unapplyLane(repoPath, name, remove))
  )

  ipcMain.handle('lanes:set-default', (_e, repoPath: string, name: string) =>
    wrap(() => lanes.setDefaultLane(repoPath, name))
  )

  ipcMain.handle('lanes:rename', (_e, repoPath: string, from: string, to: string) =>
    wrap(() => lanes.renameLane(repoPath, from, to))
  )

  ipcMain.handle('lanes:move', (_e, repoPath: string, lane: string, move: LaneMove) =>
    wrap(() => lanes.moveToLane(repoPath, lane, move))
  )

  ipcMain.handle('lanes:commit', (_e, repoPath: string, lane: string, message: string) =>
    wrap(() => lanes.commitLane(repoPath, lane, message))
  )

  ipcMain.handle('lanes:push', (_e, repoPath: string, lane: string) => wrap(() => lanes.pushLane(repoPath, lane)))

  ipcMain.handle('lanes:adopt-commits', (_e, repoPath: string, lane: string) =>
    wrap(() => lanes.moveWorkspaceCommits(repoPath, lane))
  )

  ipcMain.handle('lanes:refresh-workspace', (_e, repoPath: string) => wrap(() => lanes.refreshWorkspace(repoPath)))

  ipcMain.handle('lanes:undo', (_e, repoPath: string) => wrap(() => lanes.undoLaneChange(repoPath)))
}
