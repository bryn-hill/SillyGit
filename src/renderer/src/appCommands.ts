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
import { commandsFor, type CustomCommand } from '../../shared/customCommands'

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
  customCommands: CustomCommand[]
}): Command[] {
  const { repo, view, git, branches, conflicts, run, tabs, layout, dialogs } = app
  const { repoPath } = repo
  // Repository commands always; Branch ones on the checked-out branch; Commit ones on the selected commit.
  const branch = repo.status?.branch
  const sha = view.selection.type === 'commit' ? view.selection.hash : null
  const customCommands = [
    ...commandsFor(app.customCommands, 'repo').map((c) => ({ id: c.id, label: c.name, run: () => run.runCustom(c, {}) })),
    ...(branch
      ? commandsFor(app.customCommands, 'branch').map((c) => ({
          id: c.id,
          label: `${c.name} (${branch})`,
          run: () => run.runCustom(c, { branch })
        }))
      : []),
    ...(sha
      ? commandsFor(app.customCommands, 'commit').map((c) => ({
          id: c.id,
          label: `${c.name} (${sha.slice(0, 7)})`,
          run: () => run.runCustom(c, { sha })
        }))
      : [])
  ]
  const stack = branch ? branches.stackActions.stackOf(branch) : null
  return paletteCommands({
    repoPath,
    status: repo.status,
    customCommands,
    branches: repo.branches,
    hasRemotes: repo.remotes.length > 0,
    stashes: repo.stashes,
    operation: repo.operation,
    undoLabel: repo.undoLabel,
    redoLabel: repo.redoLabel,
    hasWorkingChanges: app.hasWorkingChanges,
    currentStack: stack && { id: stack.id, needsRestack: stack.branches.some((b) => b.needsRestack) },
    gitFlow: branches.gitFlow.config,
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
      createStackedBranch: branches.stackActions.createStackedBranch,
      stackCurrentBranch: branches.stackActions.chooseStackParent,
      restack: branches.stackActions.restack,
      pushStack: branches.stackActions.pushStack,
      setUpGitFlow: branches.gitFlow.openSetup,
      startGitFlow: branches.gitFlow.actions.startGitFlow,
      finishGitFlow: branches.gitFlow.actions.finishGitFlow,
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
