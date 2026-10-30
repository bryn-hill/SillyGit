import { Activity, lazy, Suspense, type JSX } from 'react'
import Sidebar from './Sidebar'
import CommitGraph from './CommitGraph'
import DetailPanel from './DetailPanel'
import CommitFullView from './CommitFullView'
import WorkingFileView from './WorkingFileView'
import FileHistoryView from './FileHistoryView'
import MergeResolver from './MergeResolver'
import InteractiveRebase from './InteractiveRebase'
import CompareView from './CompareView'
import PanelResizer from './PanelResizer'
import Launchpad from './Launchpad'
import RepoOverview from './RepoOverview'
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
import type { Lanes } from '../hooks/useLanes'
import { diffLanesFor } from '../lib/lanes'

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
  lanes: Lanes
  hasWorkingChanges: boolean
  onOpenTerminal: () => void
  onCheckoutPullRequest: (repoPath: string, number: number) => Promise<void>
  showError: (message: string) => void
  setNotice: (message: string | null) => void
}

/**
 * The middle of the window: the side bar, commit graph and detail panel, or
 * whatever has taken the graph's place (see useMainView), Launchpad or the
 * repository overview, or
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
  lanes,
  hasWorkingChanges,
  onOpenTerminal,
  onCheckoutPullRequest,
  showError,
  setNotice
}: Props): JSX.Element {
  const { repoPath, status, operation, refresh, headHash } = repo
  const { selection, fileView, workingDiff, editingPath, fullScreenHash, resolvingPath, rebaseBase, compare } = view

  const launchpad = view.showLaunchpad && (
    <Launchpad
      key={view.launchpadKey}
      initialReview={view.launchpadReview}
      repoPath={repoPath}
      openRepos={tabs.tabs}
      onClose={() => view.setShowLaunchpad(false)}
      onOpenTerminal={onOpenTerminal}
      onCheckout={onCheckoutPullRequest}
      onStartedWork={(path, message) => {
        // Switching tabs clears the notice, so it goes up after.
        void tabs.openRecentRepo(path).then(() => {
          if (path === repoPath) refresh(path)
          setNotice(message)
        })
      }}
    />
  )
  const overview = view.showOverview && (
    <RepoOverview
      openRepos={tabs.tabs}
      activeRepo={repoPath}
      onClose={() => view.setShowOverview(false)}
      onOpenRepo={(path) => void tabs.openRecentRepo(path)}
    />
  )
  if (!repoPath) {
    if (launchpad) return launchpad
    if (overview) return overview
    // Nothing yet while the last session's repo may still be on its way.
    if (!tabs.sessionRestored) return <div className="empty-state" aria-busy="true" />
    return (
      <EmptyState
        recentRepos={tabs.recentRepos}
        onOpenRepo={tabs.openRepo}
        onClone={tabs.clone}
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
              select: (hash: string) => view.setSelection({ type: 'commit', hash }),
              compare: (from: string, to: string) => view.openCompare({ from, to })
            }}
            amend={commitBox.amend}
            onAmendChange={commitBox.changeAmend}
            onAbsorb={commitBox.openAbsorb}
            status={status}
            commitMessage={commitBox.message}
            commitHints={commitBox.hints}
            onCommitMessageChange={commitBox.setMessage}
            onStage={git.stage}
            onUnstage={git.unstage}
            onDiscard={git.discard}
            onIgnore={git.ignore}
            onCommit={commitBox.commit}
            onOpenCommitFileDiff={view.openCommitFile}
            headHash={headHash}
            onSplitApplied={() => {
              view.closeFullScreen()
              reload()
            }}
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
            onFilterHistory={(path) => view.filterHistory({ path })}
            onCopyText={git.copyText}
            lanes={lanes}
          />
        </div>
      </>
    ) : null

  const conflictCount = status?.conflicted.length ?? 0
  const wipConflictLabel = ((): string | null => {
    if (!operation || conflictCount === 0) return null
    const files = conflictCount === 1 ? 'A file conflict was' : `${conflictCount} file conflicts were`
    return operation.kind === 'rebase'
      ? `${files} found when attempting to rebase ${operation.rebaseBranch ?? 'HEAD'} onto ${operation.currentLabel}`
      : `${files} found when attempting to merge into ${operation.currentLabel}`
  })()

  // What takes the graph's place, if anything, and whether the detail panel stays beside it. The side bar,
  // graph and detail panel are kept mounted (just hidden) while covered, and always sit in the same places,
  // so switching views never rebuilds or moves them: the panel's file list stays put, and the graph comes
  // back scrolled where it was.
  let cover: JSX.Element | null = null
  let panelBeside = true
  if (launchpad || overview) {
    panelBeside = false
    cover = launchpad || overview || null
  } else if (resolvingPath) {
    panelBeside = false
    cover = (
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
  } else if (rebaseBase) {
    panelBeside = false
    cover = (
      <InteractiveRebase
        key={rebaseBase}
        repoPath={repoPath}
        base={rebaseBase}
        onClose={view.closeRebase}
        onStart={git.startRebase}
      />
    )
  } else if (compare) {
    panelBeside = false
    cover = (
      <CompareView
        key={`${repoPath}\0${compare.from}\0${compare.to}`}
        repoPath={repoPath}
        target={compare}
        onClose={view.closeCompare}
        onSwap={() => view.openCompare({ from: compare.to, to: compare.from })}
        onShowCommit={view.showCommitInGraph}
      />
    )
  } else if (fileView) {
    panelBeside = selection.type === 'working' || selection.type === 'commit'
    cover = (
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
    )
  } else if (editingPath) {
    cover = (
      <Suspense key={`${repoPath}\0${editingPath}`} fallback={<div className="file-editor" />}>
        <FileEditor
          repoPath={repoPath}
          theme={settings.theme}
          path={editingPath}
          loadDraft={() => view.loadDraft(editingPath)}
          onDraftChange={(draft) => view.saveDraft(editingPath, draft)}
          onClose={view.closeEditor}
          onSaved={reload}
          onOpenFileView={(path, mode) => view.openFileView(path, null, mode)}
        />
      </Suspense>
    )
  } else if (workingDiff && selection.type === 'working') {
    const file = (workingDiff.staged ? status?.staged : status?.unstaged)?.find((f) => f.path === workingDiff.path)
    const diffLanes = workingDiff.staged ? null : diffLanesFor(lanes.lanes, workingDiff.path, lanes.move)
    cover = (
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
        lanes={diffLanes}
      />
    )
  } else if (fullScreenHash) {
    cover = (
      <CommitFullView
        key={`${repoPath}\0${fullScreenHash}`}
        repoPath={repoPath}
        hash={fullScreenHash}
        path={view.fullScreenPath}
        highlightLine={view.fullScreenLine}
        onPathChange={view.setFullScreenPath}
        onClose={() => {
          view.closeFullScreen()
          reload()
        }}
        onNavigateToCommit={view.navigateToCommit}
        onWorkingTreeChanged={reload}
        onEditFile={view.openEditor}
        onOpenFileView={view.openFileView}
      />
    )
  }

  return (
    <div className={cover && panelBeside && detailPanel ? 'main-layout file-focus' : 'main-layout'}>
      <Activity mode={cover ? 'hidden' : 'visible'}>
        <Sidebar
          repoPath={repoPath}
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
          remotes={repo.remotes}
          stacks={branches.stacks}
          listActions={{
            ...branches.listActions,
            selectCommit: view.selectBranchCommit,
            checkout: git.checkout,
            openRepo: (path) => void tabs.openRecentRepo(path),
            reveal: git.revealRepo,
            copyText: git.copyText,
            openUrl: git.openUrl
          }}
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
          filter={repo.graphFilter}
          onFilterChange={view.filterHistory}
          ciPollMinutes={settings.autoFetchMinutes ?? 0}
          scope={branches.graphScope}
        />
      </Activity>
      {cover}
      <Activity mode={panelBeside ? 'visible' : 'hidden'}>{detailPanel}</Activity>
    </div>
  )
}
