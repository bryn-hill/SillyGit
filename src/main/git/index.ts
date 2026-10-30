// Git commands for the main process, one module per area. Merge and rebase
// conflicts live in ../conflicts/ and branch housekeeping in ../branches.ts.
export { clone, initRepo, isGitRepo } from './repo'
export { repoOverview } from './overview'
export {
  addToGitignore,
  applyPartial,
  commit,
  discardFile,
  getCommitHints,
  getDiff,
  getStagedDiff,
  getStatus,
  getWorkingFileContent,
  isWorkingTreeClean,
  lastCommitMessage,
  listTrackedFiles,
  stageAll,
  stageFiles,
  unstageAll,
  unstageFiles
} from './workingTree'
export {
  checkoutBranch,
  createAnnotatedTag,
  createBranch,
  createBranchAt,
  createTag,
  listBranches,
  resetTo
} from './refs'
export { addRemote, fetchAll, fetchRemote, pull, push, removeRemote, renameRemote, setRemoteUrl } from './remote'
export {
  GRAPH_PAGE_SIZE,
  getBlame,
  getCoAuthorCandidates,
  getCommitDetail,
  getCommitSignature,
  getCommitFileDiff,
  getCommitFullDiff,
  getFileAtRef,
  getFileHistory,
  getGraphLog,
  getHeadHash,
  getLog,
  getTreeHash,
  searchCommits
} from './history'
export { listStashes, stash, stashApply, stashDrop, stashPop } from './stash'
export {
  applyCommitSplit,
  applyPatch,
  cherryPick,
  compareRefs,
  createPatchFromCommit,
  getCompareFileDiff,
  getDiffForSplit,
  revertCommit,
  revertHunk
} from './commits'
export { redo, redoLabel, undo, undoLabel } from './undo'
export { getReflog } from './reflog'
export { getImagePair } from './images'
export { listTreeAtRef, readTreeFile, saveTreeFile } from './tree'
export { getLfsDiff, getLfsInfo, lfsCommand, lfsTrack } from './lfs'
export {
  deleteTag,
  listSubmodules,
  listTags,
  listWorktrees,
  pruneWorktrees,
  pushTag,
  removeWorktree,
  updateSubmodules
} from './sidebarLists'
export { GitError, activityLog } from '../gitExec'
