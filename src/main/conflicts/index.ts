// Merge, rebase, cherry-pick and revert can all stop part way with conflicts.
// operation.ts reads that in-progress state from the git directory and
// continues, skips or aborts it; conflictFile.ts reads each side of a
// conflicted file for the resolver; resolve.ts saves resolutions.
export {
  abortOperation,
  cleanUpInteractiveRebase,
  continueOperation,
  getBisectState,
  getOperationState,
  hasUnmergedPaths,
  interactiveRebaseDir,
  mergeBranch,
  rebaseEditorEnv,
  rebaseOnto,
  runMayConflict,
  skipOperation
} from './operation'
export { getConflictFile, markerSizeFor } from './conflictFile'
export {
  deleteConflictedFile,
  hasConflictMarkers,
  markResolved,
  pathsWithMarkers,
  resolveRename,
  restoreConflicts,
  saveResolution,
  snapshotConflicts,
  takeSide,
  takeSideMany
} from './resolve'
