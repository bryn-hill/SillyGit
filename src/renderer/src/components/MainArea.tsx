import { lazy, Suspense, type JSX } from 'react'
import Sidebar from './Sidebar'
import CommitGraph from './CommitGraph'
import DetailPanel from './DetailPanel'
import CommitFullView from './CommitFullView'
import WorkingFileView from './WorkingFileView'
import FileHistoryView from './FileHistoryView'
import MergeResolver from './MergeResolver'
import InteractiveRebase from './InteractiveRebase'
import PanelResizer from './PanelResizer'
import Launchpad from './Launchpad'
import EmptyState from './EmptyState'
import type { Repo } from '../hooks/useRepo'
import type { MainView } from '../hooks/useMainView'
import type { AppSettings } from '../hooks/useAppSettings'
import type { PanelLayout } from '../hooks/usePanelLayout'
import type { GitActions } from '../hooks/useGitActions'
import type { BranchActions } from '../hooks/useBranchActions'
import type { BranchCleanup } from '../hooks/useBranchCleanup'
import type { Conflicts } from '../hooks/useConflicts'
import type { CommitBox } from '../hooks/useCommitBox'
import type { Tabs } from '../hooks/useTabs'

// Monaco is several MB, so the editor loads the first time a file is opened in it.
const FileEditor = lazy(() => import('./FileEditor'))

interface Props {
  repo: Repo
  view: MainView
  settings: AppSettings
  layout: PanelLayout
  git: GitActions
  branches: BranchActions
  cleanup: BranchCleanup
  conflicts: Conflicts
  commitBox: CommitBox
  tabs: Tabs
  hasWorkingChanges: boolean
  onOpenTerminal: () => void
  showError: (message: string) => void
  setNotice: (message: string | null) => void
}

/**
 * The middle of the window: the side bar, commit graph and detail panel, or
 * whatever has taken the graph's place (see useMainView), or Launchpad, or
 * the empty screen with no repo open.
 */
export default function MainArea({
  repo,
  view,
  settings,
  layout,
  git,
  branches,
  cleanup,
  conflicts,
  commitBox,
  tabs,
  hasWorkingChanges,
  onOpenTerminal,
  showError,
  setNotice
}: Props): JSX.Element {
  const { repoPath, status, operation, refresh, headHash } = repo
  const { selection, fileView, workingDiff, editingPath, fullScreenHash, resolvingPath, rebaseBase } = view

  if (view.showLaunchpad) {
    return (
      <Launchpad
        repoPath={repoPath}
        openRepos={tabs.tabs}
        onClose={() => view.setShowLaunchpad(false)}
        onOpenTerminal={onOpenTerminal}
      />
    )
  }
  if (!repoPath) {
    return (
      <EmptyState
        recentRepos={tabs.recentRepos}
        onOpenRepo={tabs.openRepo}
        onOpenRecentRepo={(path) => tabs.openRecentRepo(path)}
      />
    )
  }

  const reload = (): void => {
    refresh(repoPath)
  }

  const detailPanel =
    selection.type !== 'none' ? (
      <>
        <PanelResizer
          side="after"
          onWidthChange={layout.setDetailWidth}
          onReset={() => layout.setDetailWidth(undefined)}
        />
        <div
          className="detail-panel"
          role="complementary"
          aria-label="Details"
          style={layout.detailWidth ? { width: layout.detailWidth } : undefined}
        >
          <DetailPanel
            repoPath={repoPath}
            selection={selection}
            lookupCommit={(hash) => repo.commitByHash.get(hash)}
            multiActions={{
              cherryPick: (hashes: string[]) => git.cherryPick(hashes),
              revert: (hashes: string[]) => git.revert(hashes),
              copyText: git.copyText,
              select: (hash: string) => view.setSelection({ type: 'commit', hash })
            }}
            amend={commitBox.amend}
            onAmendChange={commitBox.changeAmend}
            status={status}
            commitMessage={commitBox.message}
            onCommitMessageChange={commitBox.setMessage}
            onStage={git.stage}
            onUnstage={git.unstage}
            onDiscard={git.discard}
            onCommit={commitBox.commit}
            onOpenCommitFileDiff={view.openCommitFile}
            onOpenWorkingFile={view.openWorkingFile}
            activeFile={view.activeFile}
            operation={operation}
            conflictActions={{
              onOpenConflict: view.setResolvingPath,
              onTakeSide: conflicts.takeSide,
              onMarkResolved: conflicts.markResolved,
              externalToolName: settings.externalToolName,
              onOpenExternal: (path) => void conflicts.openExternal(path),
              onContinue: conflicts.continueOperation,
              onAbort: conflicts.abort,
              onSkip: conflicts.skip
            }}
            onEditFile={view.openEditor}
            onOpenFileView={view.openFileView}
            onCopyText={git.copyText}
          />
        </div>
      </>
    ) : null

  if (resolvingPath) {
    return (
      <MergeResolver
        key={`${repoPath}\0${resolvingPath}`}
        repoPath={repoPath}
        path={resolvingPath}
        onClose={() => view.setResolvingPath(null)}
        onResolved={(message) => {
          view.setResolvingPath(null)
          setNotice(message ?? null)
          reload()
        }}
        onError={showError}
        externalToolName={settings.externalToolName}
        onOpenExternal={(path) => void conflicts.openExternal(path)}
      />
    )
  }
  if (rebaseBase) {
    return (
      <InteractiveRebase
        key={rebaseBase}
        repoPath={repoPath}
        base={rebaseBase}
        onClose={view.closeRebase}
        onStart={git.startRebase}
      />
    )
  }
  if (fileView) {
    return (
      <div className="main-layout file-focus">
        <FileHistoryView
          key={`${repoPath}\0${view.fileViewOpens}`}
          repoPath={repoPath}
          target={fileView}
          onClose={view.closeFileView}
          onShowDiff={view.fileViewDiff()}
          onModeChange={view.setFileViewMode}
          onOpenCommit={view.openCommitFromFileView}
          onShowInGraph={view.showCommitInGraph}
          onCopyText={git.copyText}
          onEditFile={view.editFromFileView}
          onWorkingTreeChanged={reload}
        />
        {(selection.type === 'working' || selection.type === 'commit') && detailPanel}
      </div>
    )
  }
  if (editingPath) {
    return (
      <div className="main-layout">
        <Suspense fallback={<div className="file-editor" />}>
          <FileEditor
            key={`${repoPath}\0${editingPath}`}
            repoPath={repoPath}
            path={editingPath}
            loadDraft={() => view.loadDraft(editingPath)}
            onDraftChange={(draft) => view.saveDraft(editingPath, draft)}
            onClose={view.closeEditor}
            onSaved={reload}
            onOpenFileView={(path, mode) => view.openFileView(path, null, mode)}
          />
        </Suspense>
        {detailPanel}
      </div>
    )
  }
  if (workingDiff && selection.type === 'working') {
    const file = (workingDiff.staged ? status?.staged : status?.unstaged)?.find((f) => f.path === workingDiff.path)
    return (
      <div className="main-layout file-focus">
        <WorkingFileView
          repoPath={repoPath}
          path={workingDiff.path}
          staged={workingDiff.staged}
          untracked={file?.untracked ?? false}
          refreshKey={status}
          onClose={view.closeWorkingDiff}
          onStage={git.stage}
          onUnstage={git.unstage}
          onEditFile={view.openEditor}
          onOpenFileView={view.openFileView}
          onWorkingTreeChanged={reload}
        />
        {detailPanel}
      </div>
    )
  }
  if (fullScreenHash) {
    return (
      <CommitFullView
        key={`${repoPath}\0${fullScreenHash}`}
        repoPath={repoPath}
        hash={fullScreenHash}
        initialPath={view.fullScreenPath}
        isHead={fullScreenHash === headHash}
        onClose={() => {
          view.closeFullScreen()
          reload()
        }}
        onNavigateToCommit={view.navigateToCommit}
        onWorkingTreeChanged={reload}
        onEditFile={view.openEditor}
        onOpenFileView={view.openFileView}
        onCopyText={git.copyText}
      />
    )
  }

  const conflictCount = status?.conflicted.length ?? 0
  const wipConflictLabel = ((): string | null => {
    if (!operation || conflictCount === 0) return null
    const files = conflictCount === 1 ? 'A file conflict was' : `${conflictCount} file conflicts were`
    return operation.kind === 'rebase'
      ? `${files} found when attempting to rebase ${operation.rebaseBranch ?? 'HEAD'} onto ${operation.currentLabel}`
      : `${files} found when attempting to merge into ${operation.currentLabel}`
  })()

  return (
    <div className="main-layout">
      <Sidebar
        width={layout.sidebarWidth}
        branches={repo.branches}
        headHash={headHash}
        onCheckout={git.checkout}
        onCreateBranch={branches.createBranch}
        onSelectCommit={view.selectBranchCommit}
        actions={branches.refActions}
        stashes={repo.stashes}
        stashActions={git.stashActions}
        favourites={branches.favourites}
        onToggleFavourite={branches.toggleFavourite}
        branchListSettings={settings.branchList}
        listedAt={repo.branchesListedAt}
        cleanupSnoozed={cleanup.snoozed}
        onOpenCleanup={cleanup.open}
        onSnoozeCleanup={cleanup.snooze}
      />
      <PanelResizer
        side="before"
        onWidthChange={layout.setSidebarWidth}
        onReset={() => layout.setSidebarWidth(undefined)}
      />
      <CommitGraph
        repoPath={repoPath}
        rows={repo.graphRows}
        selection={selection}
        hasWorkingChanges={hasWorkingChanges}
        wipConflictLabel={wipConflictLabel}
        headHash={headHash}
        currentBranch={status?.branch ?? null}
        branches={repo.branches}
        onSelectWorking={view.toggleWorking}
        onClickCommit={view.handleClickCommit}
        onJumpToCommit={view.jumpToCommit}
        onCheckout={git.checkout}
        actions={branches.refActions}
        hasMore={repo.hasMore}
        loadingMore={repo.loadingMore}
        onLoadMore={repo.loadMore}
        searchFocusToken={view.searchFocusToken}
        refColumnWidth={layout.refColumnWidth}
        sprints={settings.sprints}
        mergeAnimation={settings.mergeAnimation}
        onRefColumnWidthChange={layout.setRefColumnWidth}
      />
      {detailPanel}
    </div>
  )
}
