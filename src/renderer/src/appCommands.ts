import type { Command } from './components/CommandPalette'
import type { SelfUpdateState } from './hooks/useSelfUpdate'
import type { Repo } from './hooks/useRepo'
import type { MainView } from './hooks/useMainView'
import type { GitActions } from './hooks/useGitActions'
import type { BranchActions } from './hooks/useBranchActions'
import type { BranchCleanup } from './hooks/useBranchCleanup'
import type { Conflicts } from './hooks/useConflicts'
import type { CommitBox } from './hooks/useCommitBox'
import type { Run } from './hooks/useRun'
import type { Tabs } from './hooks/useTabs'
import type { PanelLayout } from './hooks/usePanelLayout'
import type { Dialogs } from './hooks/useDialogs'
import { paletteCommands } from './lib/paletteCommands'

/** The Actions list and command palette, wired to the app's features. */
export function appCommands(app: {
  repo: Repo
  view: MainView
  git: GitActions
  branches: BranchActions
  cleanup: BranchCleanup
  conflicts: Conflicts
  commitBox: CommitBox
  run: Run
  tabs: Tabs
  layout: PanelLayout
  dialogs: Dialogs
  selfUpdate: SelfUpdateState | null
  hasWorkingChanges: boolean
}): Command[] {
  const { repo, view, git, branches, conflicts, run, tabs, layout, dialogs } = app
  const { repoPath } = repo
  return paletteCommands({
    repoPath,
    status: repo.status,
    branches: repo.branches,
    hasRemotes: repo.remotes.length > 0,
    stashes: repo.stashes,
    operation: repo.operation,
    undoLabel: repo.undoLabel,
    redoLabel: repo.redoLabel,
    hasWorkingChanges: app.hasWorkingChanges,
    canRunCommit: !!run.commit,
    trackedFiles: dialogs.trackedFiles,
    tabPinned: !!repoPath && tabs.pinnedTabs.includes(repoPath),
    tabCount: tabs.tabs.length,
    recentRepos: tabs.recentRepos,
    showClaude: layout.showClaude,
    showTerminal: layout.showTerminal,
    showLaunchpad: view.showLaunchpad,
    canSelfUpdate: !!app.selfUpdate?.status.supported,
    actions: {
      undo: git.undo,
      redo: git.redo,
      fetch: git.fetch,
      pull: git.pull,
      push: git.push,
      focusSearch: view.focusSearch,
      goToWorkingChanges: view.goToWorkingChanges,
      startAmend: () => {
        view.goToWorkingChanges()
        app.commitBox.changeAmend(true)
      },
      absorb: app.commitBox.openAbsorb,
      run: (mode) => void run.run(mode),
      editRunCommand: () => void run.editCommand(),
      openFileView: (path, mode) => view.openFileView(path, null, mode),
      applyPatch: git.applyPatch,
      stash: git.stash,
      stashWithMessage: git.stashWithMessage,
      applyStash: git.stashActions.apply,
      popStash: git.stashActions.pop,
      createBranch: branches.promptCreateBranch,
      cleanUpBranches: app.cleanup.open,
      checkout: git.checkout,
      checkoutRemote: git.checkoutRemote,
      merge: git.merge,
      rebase: git.rebase,
      deleteBranch: (name) => branches.deleteBranch({ name, remote: false, current: false }),
      renameBranch: branches.renameBranch,
      continueOperation: conflicts.continueOperation,
      abortOperation: conflicts.abort,
      closeTab: (path) => tabs.closeTabs([path]),
      togglePinTab: tabs.togglePin,
      toggleClaude: () => layout.setShowClaude((v) => !v),
      revealRepo: git.revealRepo,
      copyText: git.copyText,
      showActivity: () => dialogs.setShowActivity(true),
      showUpdate: () => dialogs.setShowUpdate(true),
      toggleLaunchpad: () => view.setShowLaunchpad((v) => !v),
      cycleTab: tabs.cycle,
      clone: tabs.clone,
      toggleTerminal: () => layout.setShowTerminal((v) => !v),
      openRepo: tabs.openRepo,
      openRecentRepo: (path) => tabs.openRecentRepo(path),
      openSettings: () => dialogs.setShowSettings(true)
    }
  })
}
