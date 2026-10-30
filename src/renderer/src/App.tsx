import { useEffect, useRef, useState, type JSX } from 'react'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import MainArea from './components/MainArea'
import SettingsModal from './components/SettingsModal'
import TerminalPanel, { type TerminalPanelHandle } from './components/TerminalPanel'
import ClaudePanel from './components/claude/ClaudePanel'
import CommandPalette from './components/CommandPalette'
import ActivityLog from './components/ActivityLog'
import UpdateDialog from './components/UpdateDialog'
import StatusBanners from './components/StatusBanners'
import RefDropMenu from './components/RefDropMenu'
import { CustomCommandsContext } from './lib/customCommandMenu'
import BranchCleanupDialog from './components/BranchCleanupDialog'
import AbsorbDialog from './components/AbsorbDialog'
import { NO_SELF_UPDATE } from '../../shared/selfUpdate'
import { appCommands } from './appCommands'
import { useRepo } from './hooks/useRepo'
import { useAppSettings } from './hooks/useAppSettings'
import { useSelfUpdate } from './hooks/useSelfUpdate'
import { usePullRequests } from './hooks/usePullRequests'
import { usePrompt } from './hooks/usePrompt'
import { usePanelLayout } from './hooks/usePanelLayout'
import { useDialogs } from './hooks/useDialogs'
import { useGitRunner } from './hooks/useGitRunner'
import { useCommitBox } from './hooks/useCommitBox'
import { useMainView } from './hooks/useMainView'
import { useGitActions } from './hooks/useGitActions'
import { useBranchActions } from './hooks/useBranchActions'
import { useBranchCleanup } from './hooks/useBranchCleanup'
import { useConflicts } from './hooks/useConflicts'
import { useRun } from './hooks/useRun'
import { useTabs } from './hooks/useTabs'
import { useAppShortcuts } from './hooks/useAppShortcuts'

/**
 * The window: repo tabs, the toolbar, banners, the main area with the
 * terminal under it and the Claude panel beside it, and the dialogs. Each
 * feature's state and actions live in its hook (see hooks/); this wires them
 * together and lays them out.
 */
export default function App(): JSX.Element {
  // showError is the state setter itself, so hooks can depend on it.
  const [error, showError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { askText, dialog: promptDialog } = usePrompt()
  const settings = useAppSettings(showError)
  const selfUpdate = useSelfUpdate()

  const repo = useRepo({ onError: showError, autoFetchMinutes: settings.autoFetchMinutes })
  const { repoPath, status, operation } = repo
  const [pullRequests, revalidatePullRequests] = usePullRequests(repoPath)
  const layout = usePanelLayout()
  const dialogs = useDialogs(repoPath)
  const git = useGitRunner({ repoPath, refresh: repo.refresh, showError, setNotice })
  const commitBox = useCommitBox({ repoPath, operation, git, refresh: repo.refresh, showError })

  // Amending can reword the last commit with nothing changed, so the WIP row
  // (where the commit box lives) stays while Amend is on.
  const hasWorkingChanges =
    !!status &&
    (status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.conflicted.length > 0 ||
      !!operation ||
      commitBox.amend)

  const view = useMainView({ repo, hasWorkingChanges, keysBlocked: dialogs.showSettings })
  const actions = useGitActions({ repo, git, view, askText, showError, setNotice })
  const branches = useBranchActions({
    repo,
    git,
    actions,
    view,
    pullRequests,
    revalidatePullRequests,
    askText,
    showError,
    setNotice
  })
  const cleanup = useBranchCleanup({ repo, git, showError })
  const conflicts = useConflicts({
    repo,
    git,
    actions,
    view,
    commitBox,
    externalToolName: settings.externalToolName,
    showError,
    setNotice
  })
  const terminalRef = useRef<TerminalPanelHandle | null>(null)
  const run = useRun({
    repo,
    git,
    selection: view.selection,
    hasWorkingChanges,
    askText,
    showError,
    showTerminal: () => layout.setShowTerminal(true),
    terminalRef
  })

  // Remember each tab's selection for when it's switched back to.
  const { rememberSelection } = repo
  useEffect(() => rememberSelection(view.selection), [rememberSelection, view.selection])

  /** Shows a different repo (tab): what it showed last time, with the selection it had. */
  const showRepo = (path: string | null): void => {
    if (path === repoPath) return
    const lastSelection = repo.show(path)
    commitBox.resetAmend()
    view.resetForRepo(lastSelection)
  }
  const tabs = useTabs({ repo, git, view, showRepo, restoreLayout: layout.restore, askText, showError, setNotice })

  useAppShortcuts({
    blocked: !!promptDialog || dialogs.showSettings || dialogs.showActivity,
    paletteOpen: dialogs.palette !== null,
    repoOpen: !!repoPath,
    busy: git.busy,
    tabs: tabs.tabs,
    togglePalette: () => dialogs.setPalette((v) => (v ? null : 'modal')),
    focusSearch: view.focusSearch,
    undo: actions.undo,
    redo: actions.redo,
    openRepo: tabs.openRepo,
    cycleTab: tabs.cycle,
    selectTab: tabs.selectTab,
    openSettings: () => dialogs.setShowSettings(true)
  })

  const { showTerminal, setShowTerminal, showClaude, setShowClaude } = layout

  return (
    <div className="app">
      <TabBar
        tabs={tabs.tabs}
        pinned={tabs.pinnedTabs}
        activeTab={repoPath}
        launchpadActive={view.showLaunchpad}
        onSelect={tabs.selectTab}
        onClose={tabs.closeTabs}
        onNewTab={tabs.openRepo}
        onOpenLaunchpad={() => view.setShowLaunchpad(true)}
        onTogglePin={tabs.togglePin}
        onMove={tabs.move}
        onCopyPath={actions.copyText}
      />
      <TopBar
        repoPath={repoPath}
        status={status}
        branches={repo.branches}
        busy={git.busy}
        onOpenRepo={tabs.openRepo}
        recentRepos={tabs.recentRepos}
        onOpenRecentRepo={(path) => tabs.openRecentRepo(path, true)}
        onPush={actions.push}
        onPull={actions.pull}
        pullMode={actions.pullMode}
        onFetch={actions.fetch}
        fetching={repo.fetching}
        hasRemotes={repo.remotes.length > 0}
        undoLabel={repo.undoLabel}
        onUndo={actions.undo}
        redoLabel={repo.redoLabel}
        onRedo={actions.redo}
        onCreateBranch={branches.promptCreateBranch}
        hasChanges={!!status && (status.staged.length > 0 || status.unstaged.length > 0) && !operation}
        stashCount={repo.stashes.length}
        actionsOpen={dialogs.palette === 'dropdown'}
        onToggleActions={() => dialogs.setPalette((v) => (v === 'dropdown' ? null : 'dropdown'))}
        onStash={actions.stash}
        onStashPop={actions.stashPop}
        onCheckout={actions.checkout}
        onOpenSettings={() => dialogs.setShowSettings(true)}
        runCommand={run.command}
        runCommit={run.commit}
        runMode={run.mode}
        running={run.running}
        preparingRun={run.preparing}
        onRun={(mode) => void run.run(mode)}
        onStopRun={run.stop}
        onEditRunCommand={() => void run.editCommand()}
        terminalVisible={showTerminal}
        onToggleTerminal={() => setShowTerminal((v) => !v)}
        claudeVisible={showClaude}
        onToggleClaude={() => setShowClaude((v) => !v)}
        selfUpdate={selfUpdate?.status ?? NO_SELF_UPDATE}
        updating={!!selfUpdate?.step}
        onOpenUpdate={() => dialogs.setShowUpdate(true)}
      />
      <StatusBanners
        error={error}
        onDismissError={() => showError(null)}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        undoMessage={conflicts.undoMessage}
        onUndo={conflicts.undoLast}
        onDismissUndo={conflicts.dismissUndo}
        restoreMessage={cleanup.restoreMessage}
        onRestore={cleanup.restoreBranches}
        onDismissRestore={cleanup.dismissRestore}
      />
      <div className="workspace-row">
        <div className="workspace">
          <div className="workspace-main">
            <CustomCommandsContext value={{ commands: settings.customCommands, run: run.runCustom }}>
              <MainArea
                repo={repo}
                view={view}
                settings={settings}
                layout={layout}
                git={actions}
                branches={branches}
                cleanup={cleanup}
                conflicts={conflicts}
                commitBox={commitBox}
                tabs={tabs}
                hasWorkingChanges={hasWorkingChanges}
                onOpenTerminal={() => setShowTerminal(true)}
                showError={showError}
                setNotice={setNotice}
              />
            </CustomCommandsContext>
          </div>
          <TerminalPanel
            ref={terminalRef}
            onRunningChange={run.setRunningKeys}
            cwd={repoPath}
            visible={showTerminal}
            height={layout.terminalHeight}
            onToggle={() => setShowTerminal(false)}
            onHeightChange={layout.setTerminalHeight}
          />
        </div>
        {repoPath && (
          <ClaudePanel
            key={repoPath}
            repoPath={repoPath}
            visible={showClaude}
            width={layout.claudeWidth}
            onWidthChange={layout.setClaudeWidth}
            onClose={() => setShowClaude(false)}
            onFilesChanged={repo.refreshSoon}
          />
        )}
      </div>
      {cleanup.dialogOpen && repoPath && (
        <BranchCleanupDialog
          repoPath={repoPath}
          favourites={branches.favourites}
          settings={settings.branchList}
          nowMs={repo.branchesListedAt}
          onDelete={cleanup.deleteBranches}
          onClose={cleanup.close}
        />
      )}
      {commitBox.absorbOpen && repoPath && (
        <AbsorbDialog
          repoPath={repoPath}
          onAbsorb={(head, diff, assignments) => {
            commitBox.closeAbsorb()
            actions.absorb(head, diff, assignments)
          }}
          onClose={commitBox.closeAbsorb}
        />
      )}
      {dialogs.showSettings && (
        <SettingsModal
          onClose={() => dialogs.setShowSettings(false)}
          autoFetchMinutes={settings.autoFetchMinutes ?? 0}
          onAutoFetchChange={settings.setAutoFetchMinutes}
          sprints={settings.sprints}
          onSprintsChange={settings.setSprints}
          branchList={settings.branchList}
          onBranchListChange={settings.setBranchList}
          mergeTool={settings.mergeTool}
          onMergeToolChange={settings.setMergeTool}
          mergeAnimation={settings.mergeAnimation}
          onMergeAnimationChange={settings.setMergeAnimation}
          customCommands={settings.customCommands}
          onCustomCommandsChange={settings.setCustomCommands}
        />
      )}
      {dialogs.palette && (
        <CommandPalette
          commands={appCommands({
            repo,
            view,
            git: actions,
            branches,
            cleanup,
            conflicts,
            commitBox,
            run,
            tabs,
            layout,
            dialogs,
            selfUpdate,
            hasWorkingChanges,
            customCommands: settings.customCommands
          })}
          variant={dialogs.palette}
          onClose={() => dialogs.setPalette(null)}
        />
      )}
      {dialogs.showUpdate && selfUpdate?.status.supported && (
        <UpdateDialog
          status={selfUpdate.status}
          step={selfUpdate.step}
          onClose={() => dialogs.setShowUpdate(false)}
        />
      )}
      {dialogs.showActivity && <ActivityLog repoPath={repoPath} onClose={() => dialogs.setShowActivity(false)} />}
      {promptDialog}
      <RefDropMenu repoPath={repoPath} onError={showError} onPick={actions.runDropAction} />
    </div>
  )
}
