import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState, type JSX } from 'react'
import type {
  ConflictableResult,
  ConflictSnapshot,
  CommitSearchHit,
  FileStatus,
  PullMode,
  SavedSession,
  StashEntry
} from '../../shared/types'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import Sidebar from './components/Sidebar'
import CommitGraph, { type ClickModifiers } from './components/CommitGraph'
import DetailPanel, { type ActiveFile } from './components/DetailPanel'
import CommitFullView from './components/CommitFullView'
import WorkingFileView from './components/WorkingFileView'
import FileHistoryView, { type FileViewMode, type FileViewTarget } from './components/FileHistoryView'
import MergeResolver from './components/MergeResolver'
import InteractiveRebase from './components/InteractiveRebase'
import type { RebasePlan, RebaseStep } from '../../shared/rebase'
import Launchpad from './components/Launchpad'
import SettingsModal from './components/SettingsModal'
import TerminalPanel, { type TerminalPanelHandle } from './components/TerminalPanel'
import type { RunMode } from '../../shared/run'
import ClaudePanel from './components/claude/ClaudePanel'
import CommandPalette from './components/CommandPalette'
import ActivityLog from './components/ActivityLog'
import UpdateDialog from './components/UpdateDialog'
import EmptyState from './components/EmptyState'
import StatusBanners from './components/StatusBanners'
import RefDropMenu from './components/RefDropMenu'
import type { RefActions, RefTarget } from './components/RefContextMenu'
import { repoDisplayName } from './lib/repoName'
import { resolveBranchRemote } from '../../shared/branchRemote'
import { withPullRequestText } from '../../shared/quickActions'
import { DEFAULT_SPRINT_SETTINGS } from '../../shared/sprints'
import { DEFAULT_BRANCH_LIST_SETTINGS, toggleFavourite } from '../../shared/branchStatus'
import { DEFAULT_MERGE_TOOL_SETTINGS, mergeToolName } from '../../shared/mergeTools'
import { NO_SELF_UPDATE } from '../../shared/selfUpdate'
import type { DragSource, DropOption } from './lib/refDrag'
import { clickCommit, fixSelection, type Selection } from './lib/selection'
import { isPrimary, isTyping } from './lib/shortcuts'
import { cycleTab, moveTab, openTab, tabAfterClosing, tabForDigit, togglePinnedTab } from './lib/tabs'
import { loadPullMode, loadRunMode, savePullMode, saveRunMode } from './lib/preferences'
import { paletteCommands } from './lib/paletteCommands'
import type { IpcResult } from './lib/ipc'
import { useRepo } from './hooks/useRepo'
import { useSavedSetting } from './hooks/useSavedSetting'
import { useRepoValue } from './hooks/useRepoValue'
import { useSelfUpdate } from './hooks/useSelfUpdate'
import { usePullRequests } from './hooks/usePullRequests'
import { usePrompt } from './hooks/usePrompt'
import { usePanelLayout } from './hooks/usePanelLayout'
import { useArrowKeySelection } from './hooks/useArrowKeySelection'
import BranchCleanupDialog from './components/BranchCleanupDialog'
import { CLEANUP_SNOOZE_DAYS, type DeletedBranch } from '../../shared/branchCleanup'

// Monaco is several MB, so the editor loads the first time a file is opened in it.
const FileEditor = lazy(() => import('./components/FileEditor'))

/** Identifies a repo's run in the terminal: its working tree, or its isolated checkout. */
const runKey = (repoPath: string, isolated: boolean): string => `${repoPath}\0${isolated ? 'isolated' : 'tree'}`

const NO_FAVOURITES: string[] = []

const fileCount = (n: number): string => (n === 1 ? '1 file' : `${n} files`)

export default function App(): JSX.Element {
  const [error, showError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { askText, dialog: promptDialog } = usePrompt()

  // --- Settings kept by the main process ---------------------------------------
  // Minutes between background fetches (0 = off).
  const [autoFetchMinutes, setAutoFetchMinutes] = useSavedSetting(
    window.api.getAutoFetchMinutes,
    window.api.setAutoFetchMinutes,
    null,
    showError
  )
  // Sprint markers on the graph (off by default).
  const [sprintSettings, setSprintSettings] = useSavedSetting(
    window.api.getSprintSettings,
    window.api.setSprintSettings,
    DEFAULT_SPRINT_SETTINGS,
    showError
  )
  const [mergeToolSettings, setMergeToolSettings] = useSavedSetting(
    window.api.getMergeToolSettings,
    window.api.setMergeToolSettings,
    DEFAULT_MERGE_TOOL_SETTINGS,
    showError
  )
  const externalToolName = mergeToolName(mergeToolSettings)
  // Stale tags in the branch list.
  const [branchListSettings, setBranchListSettings] = useSavedSetting(
    window.api.getBranchListSettings,
    window.api.setBranchListSettings,
    DEFAULT_BRANCH_LIST_SETTINGS,
    showError
  )
  // Lanes colliding into a new merge on the graph (on by default).
  const [mergeAnimation, setMergeAnimation] = useSavedSetting(
    window.api.getMergeAnimation,
    window.api.setMergeAnimation,
    true,
    showError
  )
  const selfUpdate = useSelfUpdate()

  // --- The repo showing, and what's read from it ---------------------------------
  const repo = useRepo({ onError: showError, autoFetchMinutes })
  const { repoPath, status, branches, remotes, operation, stashes, undoLabel, redoLabel, refresh } = repo
  const { graphRows, graphOrder, commitByHash, headHash } = repo
  const [pullRequests, revalidatePullRequests] = usePullRequests(repoPath)
  // Starred branches, per repo.
  const [favourites, setFavourites] = useRepoValue(repoPath, window.api.getFavouriteBranches, NO_FAVOURITES)
  // When the "branches to tidy" banner may show again, per repo.
  const [cleanupSnoozedUntil, setCleanupSnoozedUntil] = useRepoValue(repoPath, window.api.getCleanupSnooze, null)
  const cleanupSnoozed = cleanupSnoozedUntil !== null && cleanupSnoozedUntil > repo.branchesListedAt
  const [showCleanup, setShowCleanup] = useState(false)
  // The last batch of branches the cleanup dialog deleted, for Restore.
  const [branchRestore, setBranchRestore] = useState<{ repoPath: string; deleted: DeletedBranch[]; message: string } | null>(
    null
  )
  // The repo's saved Run command, or null until one is set.
  const [runCommand, setRunCommand] = useRepoValue(
    repoPath,
    async (path) => (await window.api.getRunCommand(path)).command,
    null
  )

  // --- Tabs and session ---------------------------------------------------------
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  // Repos open as tabs, pinned ones first; repoPath is the active one.
  const [tabs, setTabs] = useState<string[]>([])
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([])
  // Layout and tab changes are saved only once the previous session has been
  // restored, so the defaults never overwrite it.
  const [sessionRestored, setSessionRestored] = useState(false)
  const layout = usePanelLayout(sessionRestored)
  const { showTerminal, setShowTerminal, showClaude, setShowClaude } = layout

  // --- What the main area shows ------------------------------------------------------
  const [selection, setSelection] = useState<Selection>({ type: 'working' })
  const [showLaunchpad, setShowLaunchpad] = useState(false)
  const [resolvingPath, setResolvingPath] = useState<string | null>(null)
  // The interactive rebase being planned, and the repo it's for.
  const [rebaseEditor, setRebaseEditor] = useState<{ repoPath: string; base: string } | null>(null)
  const rebaseBase = rebaseEditor && rebaseEditor.repoPath === repoPath ? rebaseEditor.base : null
  // The file open in the editor, per repo tab, and unsaved text left in files
  // whose editor was hidden (tab switch, Launchpad, another file opened).
  const [editingFiles, setEditingFiles] = useState<Record<string, string>>({})
  const editorDrafts = useRef(new Map<string, string>())
  const [fullScreenHash, setFullScreenHash] = useState<string | null>(null)
  const [fullScreenPath, setFullScreenPath] = useState<string | null>(null)
  /** A file's history or blame, shown in place of the graph. */
  const [fileView, setFileView] = useState<FileViewTarget | null>(null)
  // Bumped on every open, so the view starts fresh even for the same file.
  const [fileViewOpens, setFileViewOpens] = useState(0)
  // An uncommitted file's diff shown in place of the graph, from the unstaged or staged list.
  const [workingDiff, setWorkingDiff] = useState<{ path: string; staged: boolean } | null>(null)
  // History or Blame as last picked in the open file view, kept when another file is picked beside it.
  const fileViewMode = useRef<FileViewMode>('history')
  const [searchFocusToken, setSearchFocusToken] = useState(0)

  // --- Dialogs and overlays -----------------------------------------------------------
  const [showSettings, setShowSettings] = useState(false)
  // Cmd+K opens the palette in the middle of the window; the toolbar's
  // Actions button opens the same list hanging under it.
  const [palette, setPalette] = useState<'modal' | 'dropdown' | null>(null)
  /** Tracked files, loaded when the Actions list opens, for its Blame and File history pickers. */
  const [trackedFiles, setTrackedFiles] = useState<string[]>([])
  const [showActivity, setShowActivity] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)

  // --- Committing, conflicts and running --------------------------------------------
  const [busy, setBusy] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [amend, setAmend] = useState(false)
  // The last bulk conflict action (take a side, mark resolved), for Undo.
  const [conflictUndo, setConflictUndo] = useState<{ repoPath: string; snapshot: ConflictSnapshot; message: string } | null>(
    null
  )
  // Undo only makes sense while the merge (or rebase…) that the files belong to is still going.
  if (!operation && conflictUndo) setConflictUndo(null)
  const terminalRef = useRef<TerminalPanelHandle | null>(null)
  const [runningKeys, setRunningKeys] = useState<string[]>([])
  const [runMode, setRunMode] = useState<RunMode>(loadRunMode)
  const [preparingRun, setPreparingRun] = useState(false)
  const [pullMode, setPullMode] = useState<PullMode>(loadPullMode)

  const conflictCount = status?.conflicted.length ?? 0
  // Amending can reword the last commit with nothing changed, so the WIP row
  // (where the commit box lives) stays while Amend is on.
  const hasWorkingChanges =
    !!status &&
    (status.staged.length > 0 || status.unstaged.length > 0 || conflictCount > 0 || !!operation || amend)

  // Prefill the commit message with git's prepared merge message, once per
  // operation, without overwriting anything the user typed.
  const operationKey = operation ? `${operation.kind}:${operation.incomingLabel}` : null
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null)
  if (operationKey !== prefilledFor) {
    setPrefilledFor(operationKey)
    if (operation?.message) setCommitMessage((m) => (m.trim() ? m : operation.message!))
  }

  const wipConflictLabel = ((): string | null => {
    if (!operation || conflictCount === 0) return null
    const files = conflictCount === 1 ? 'A file conflict was' : `${conflictCount} file conflicts were`
    return operation.kind === 'rebase'
      ? `${files} found when attempting to rebase ${operation.rebaseBranch ?? 'HEAD'} onto ${operation.currentLabel}`
      : `${files} found when attempting to merge into ${operation.currentLabel}`
  })()

  // Keep the selection on something that exists, fixed up while rendering so a
  // stale selection never paints.
  const fixedSelection = fixSelection(
    selection,
    (hash) => commitByHash.has(hash),
    graphRows[0]?.commit.hash ?? null,
    hasWorkingChanges
  )
  if (fixedSelection !== selection) setSelection(fixedSelection)

  // Keep an open working diff on its file as it's staged or unstaged; close it once the file has no changes left.
  // Fixed up while rendering, so the diff never paints for a side the file has left.
  if (workingDiff && status) {
    const listed = (staged: boolean): boolean =>
      (staged ? status.staged : status.unstaged).some((f) => f.path === workingDiff.path)
    if (!listed(workingDiff.staged)) {
      setWorkingDiff(listed(!workingDiff.staged) ? { ...workingDiff, staged: !workingDiff.staged } : null)
    }
  }

  // Saved straight away (tabs change rarely) so a quick quit never loses one.
  useEffect(() => {
    if (sessionRestored) window.api.saveTabs({ openTabs: tabs, pinnedTabs, activeTab: repoPath })
  }, [sessionRestored, tabs, pinnedTabs, repoPath])

  // Remember each tab's selection for when it's switched back to.
  const { rememberSelection } = repo
  useEffect(() => rememberSelection(selection), [rememberSelection, selection])

  useArrowKeySelection(
    !(fullScreenHash || workingDiff || showLaunchpad || showSettings || resolvingPath || rebaseBase),
    selection,
    graphOrder,
    hasWorkingChanges,
    setSelection
  )

  // The Actions list's Blame and File history pickers list every tracked file.
  useEffect(() => {
    if (!palette || !repoPath) return
    let cancelled = false
    window.api.trackedFiles(repoPath).then((res) => {
      if (!cancelled) setTrackedFiles(res.ok ? res.data : [])
    })
    return () => {
      cancelled = true
    }
  }, [palette, repoPath])

  // --- Main area navigation -------------------------------------------------------

  /** Back to the graph from a full-window commit, file history or working diff. */
  const closeFileViews = (): void => {
    setFullScreenHash(null)
    setFileView(null)
    setWorkingDiff(null)
  }

  const goToWorkingChanges = (): void => {
    closeFileViews()
    setShowLaunchpad(false)
    setSelection({ type: 'working' })
  }

  const showFileView = (target: FileViewTarget): void => {
    setFileView(target)
    setFileViewOpens((n) => n + 1)
  }

  /** Shows a file's history or blame in place of the graph; a null `ref` starts from the working tree. */
  const openFileView = (path: string, ref: string | null, mode: FileViewMode): void => {
    setShowLaunchpad(false)
    setRebaseEditor(null)
    fileViewMode.current = mode
    showFileView({ path, ref, mode })
  }

  const editingPath = repoPath ? editingFiles[repoPath] : undefined
  const openEditor = (path: string): void => {
    if (repoPath) setEditingFiles((current) => ({ ...current, [repoPath]: path }))
  }
  const closeEditor = (): void => {
    if (!repoPath) return
    setEditingFiles(({ [repoPath]: _closed, ...rest }) => rest)
  }

  /** Opens a working change's diff full window; with history or blame open, switches that to the file instead. */
  const openWorkingFile = (file: FileStatus, staged: boolean): void => {
    if (fileView) {
      showFileView({ path: file.path, ref: null, mode: fileViewMode.current })
      setWorkingDiff({ path: file.path, staged })
      return
    }
    // Clicking the open file again closes the diff.
    if (workingDiff?.path === file.path && workingDiff.staged === staged) {
      setWorkingDiff(null)
      return
    }
    closeEditor()
    setWorkingDiff({ path: file.path, staged })
  }

  const openCommitFile = (hash: string, path: string): void => {
    if (fileView) {
      showFileView({ path, ref: hash, mode: fileViewMode.current })
      return
    }
    closeEditor()
    setFullScreenHash(hash)
    setFullScreenPath(path)
  }

  /** Back from history or blame to the file's diff, when it's one of the listed changes. */
  const fileViewDiff = (): (() => void) | undefined => {
    if (!fileView) return undefined
    const { path } = fileView
    if (selection.type === 'commit' && fileView.ref === selection.hash) {
      const hash = selection.hash
      return () => {
        setFileView(null)
        setFullScreenHash(hash)
        setFullScreenPath(path)
      }
    }
    if (selection.type === 'working' && fileView.ref == null && status) {
      const staged = workingDiff?.path === path ? workingDiff.staged : !status.unstaged.some((f) => f.path === path)
      if (!(staged ? status.staged : status.unstaged).some((f) => f.path === path)) return undefined
      return () => {
        setFileView(null)
        setWorkingDiff({ path, staged })
      }
    }
    return undefined
  }

  const handleClickCommit = (hash: string, modifiers: ClickModifiers): void =>
    setSelection((current) => clickCommit(current, hash, modifiers, graphOrder))

  /** Selects one commit, loading more of the graph first when it's further down than what's loaded. */
  const jumpToCommit = async (hit: CommitSearchHit): Promise<void> => {
    if (!commitByHash.has(hit.hash)) await repo.loadThrough(hit.index)
    closeFileViews()
    setSelection({ type: 'commit', hash: hit.hash })
  }

  /** From the side bar: select the commit a branch points at, searching for it if it isn't loaded. */
  const handleSelectBranchCommit = async (hash: string): Promise<void> => {
    if (!repoPath) return
    if (commitByHash.has(hash)) {
      setSelection({ type: 'commit', hash })
      return
    }
    const res = await window.api.searchCommits(repoPath, hash)
    const hit = res.ok ? res.data.find((h) => h.hash === hash) : undefined
    if (hit) await jumpToCommit(hit)
  }

  const showCommitInGraph = (hash: string): void => {
    closeFileViews()
    closeEditor()
    void handleSelectBranchCommit(hash)
  }

  const focusSearch = (): void => {
    closeFileViews()
    setShowLaunchpad(false)
    setResolvingPath(null)
    setSearchFocusToken((n) => n + 1)
  }

  // --- Repos and tabs -------------------------------------------------------------

  /** Shows a different repo (tab), with the selection it had last time. */
  const showRepo = (path: string | null): void => {
    if (path === repoPath) return
    const lastSelection = repo.show(path)
    setAmend(false)
    setSelection(lastSelection ?? { type: 'working' })
    closeFileViews()
    setResolvingPath(null)
  }

  // Reopen whatever was open when the app last quit.
  const restoreSession = useEffectEvent((session: SavedSession) => {
    layout.restore(session.layout)
    setRecentRepos(session.recentRepos)
    setTabs(session.openTabs)
    setPinnedTabs(session.pinnedTabs)
    if (session.repoPath) showRepo(session.repoPath)
    if (session.missingRepo) {
      setNotice(`Couldn't reopen ${session.missingRepo}: the folder is gone or is no longer a git repository.`)
      window.api.forgetRecentRepo(session.missingRepo)
    }
    setSessionRestored(true)
  })
  useEffect(() => {
    window.api.getSession().then((session) => restoreSession(session))
  }, [])

  const handleOpenRepo = async (): Promise<void> => {
    const picked = await window.api.openRepoDialog()
    if (!picked) return
    const isRepo = await window.api.isGitRepo(picked)
    if (!isRepo) {
      const shouldInit = window.confirm(`"${picked}" is not a git repository yet. Initialize one here?`)
      if (!shouldInit) return
      const initRes = await window.api.initRepo(picked)
      if (!initRes.ok) {
        showError(initRes.error)
        return
      }
    }
    await switchToRepo(picked)
  }

  /**
   * Shows `path`: its tab if it has one, otherwise a new tab, or, with
   * `replace`, the current tab now showing `path` (unless that tab is pinned).
   */
  const switchToRepo = async (path: string, replace = false): Promise<void> => {
    // The replaced tab's snapshot goes here, not in the updater below: updaters must be pure.
    const replacing = replace && !!repoPath && !pinnedTabs.includes(repoPath) && !tabs.includes(path)
    if (replacing) repo.forget(repoPath)
    setTabs((current) => openTab(current, path, repoPath, replacing))
    showRepo(path)
    setShowLaunchpad(false)
    showError(null)
    setNotice(null)
    const res = await window.api.recordOpenedRepo(path)
    if (res.ok) setRecentRepos(res.data)
  }

  /** Opens a recent repo, in place of the current tab when `replace` is set. */
  const handleOpenRecentRepo = async (path: string, replace = false): Promise<void> => {
    if (path === repoPath) {
      setShowLaunchpad(false)
      return
    }
    if (!(await window.api.isGitRepo(path))) {
      showError(`${path} is gone or is no longer a git repository, so it was removed from recent repositories.`)
      const res = await window.api.forgetRecentRepo(path)
      if (res.ok) setRecentRepos(res.data)
      if (tabs.includes(path)) closeTabs([path])
      return
    }
    await switchToRepo(path, replace)
  }

  const selectTab = (path: string): void => {
    if (path === repoPath) setShowLaunchpad(false)
    else handleOpenRecentRepo(path)
  }

  const closeTabs = (paths: string[]): void => {
    if (paths.length === 0) return
    const draftKeys = [...editorDrafts.current.keys()].filter((key) => paths.includes(key.split('\0')[0]))
    if (draftKeys.length > 0) {
      const files = draftKeys.map((key) => key.split('\0')[1]).join(', ')
      if (!window.confirm(`Discard unsaved changes to ${files}?`)) return
      draftKeys.forEach((key) => editorDrafts.current.delete(key))
    }
    setEditingFiles((current) => Object.fromEntries(Object.entries(current).filter(([path]) => !paths.includes(path))))
    for (const path of paths) repo.forget(path)
    setTabs(tabs.filter((p) => !paths.includes(p)))
    setPinnedTabs((current) => current.filter((p) => !paths.includes(p)))
    if (repoPath && paths.includes(repoPath)) {
      const next = tabAfterClosing(tabs, repoPath, paths)
      if (next) handleOpenRecentRepo(next)
      else showRepo(null)
    }
  }

  const togglePinTab = (path: string): void => {
    const next = togglePinnedTab(tabs, pinnedTabs, path)
    setPinnedTabs(next.pinned)
    setTabs(next.tabs)
  }

  const handleMoveTab = (path: string, before: string | null): void =>
    setTabs((current) => moveTab(current, pinnedTabs, path, before))

  /** Ctrl+Tab and friends: the tab `offset` places along, wrapping around. */
  const handleCycleTab = (offset: number): void => {
    const next = cycleTab(tabs, repoPath, offset)
    if (next) selectTab(next)
  }

  const handleClone = async (): Promise<void> => {
    const url = await askText({
      title: 'Clone a repository',
      label: 'Repository URL',
      placeholder: 'https://github.com/owner/repo.git',
      submitLabel: 'Choose folder…'
    })
    if (!url?.trim()) return
    setBusy(true)
    showError(null)
    setNotice('Cloning…')
    try {
      const res = await window.api.clone(url.trim())
      setNotice(null)
      if (!res.ok) showError(res.error)
      else if (res.data) await switchToRepo(res.data)
    } finally {
      setBusy(false)
    }
  }

  // --- Git commands ---------------------------------------------------------------

  const withBusy = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    showError(null)
    setNotice(null)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  /**
   * Runs a git command on the open repo while busy, reports a failure (or
   * hands the result to `onDone`), then refreshes.
   */
  const runGit = <T,>(call: (path: string) => Promise<IpcResult<T>>, onDone?: (data: T, path: string) => void): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await call(repoPath)
      if (!res.ok) showError(res.error)
      else onDone?.(res.data, repoPath)
      await refresh(repoPath)
    })
  }

  /** Like runGit, but `after` runs once the refresh is done. */
  const runGitThen = <T,>(call: (path: string) => Promise<IpcResult<T>>, after: (data: T) => void): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await call(repoPath)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
      if (res.ok) after(res.data)
    })
  }

  /**
   * Runs a git command that may stop on conflicts. When it does, the working
   * changes open so the conflicted files are in view.
   */
  const runConflictable = (call: (path: string) => Promise<IpcResult<ConflictableResult>>): void =>
    // Selected after the refresh, so the WIP row exists to select.
    runGitThen(call, (data) => {
      if (data.conflicts) {
        closeFileViews()
        setSelection({ type: 'working' })
      }
    })

  const handleStage = (paths: string[]): void => runGit((path) => window.api.stage(path, paths))

  const handleUnstage = (paths: string[]): void => runGit((path) => window.api.unstage(path, paths))

  const handleDiscard = (file: FileStatus): void => {
    if (!repoPath) return
    if (!window.confirm(`Discard changes to "${file.path}"? This cannot be undone.`)) return
    runGit((path) => window.api.discard(path, file.path, file.untracked))
  }

  const handleCommit = (): void => {
    if (!repoPath || !commitMessage.trim()) return
    withBusy(async () => {
      const res = await window.api.commit(repoPath, commitMessage.trim(), amend)
      if (!res.ok) {
        showError(res.error)
        return
      }
      setCommitMessage('')
      setAmend(false)
      await refresh(repoPath)
    })
  }

  // Turning Amend on starts from the last commit's message, unless one is
  // being typed; turning it off clears that message again if it's untouched.
  const amendPrefill = useRef<string | null>(null)
  const handleAmendChange = async (on: boolean): Promise<void> => {
    if (!repoPath) return
    setAmend(on)
    if (on) {
      const res = await window.api.lastCommitMessage(repoPath)
      if (res.ok && res.data) {
        amendPrefill.current = res.data
        setCommitMessage((m) => (m.trim() ? m : res.data))
      }
    } else {
      setCommitMessage((m) => (m === amendPrefill.current ? '' : m))
      amendPrefill.current = null
    }
  }

  const startAmend = (): void => {
    goToWorkingChanges()
    handleAmendChange(true)
  }

  const handleFetch = (): void => {
    repo.fetchRemotes(false)
  }

  const handleUndo = (): void => {
    if (undoLabel) runGit((path) => window.api.undo(path), (done) => setNotice(`${done}.`))
  }

  const handleRedo = (): void => {
    if (redoLabel) runGit((path) => window.api.redo(path), (done) => setNotice(`${done}.`))
  }

  const handleCheckout = (branch: string): void => runGit((path) => window.api.checkout(path, branch))

  const handleCheckoutRemote = (name: string): void => runGit((path) => window.api.checkoutRemoteBranch(path, name))

  const handleCreateBranch = (branch: string): void => runGit((path) => window.api.createBranch(path, branch))

  const promptCreateBranch = async (): Promise<void> => {
    const name = await askText({ title: 'Create branch', label: 'Branch name', submitLabel: 'Create branch' })
    if (name) handleCreateBranch(name)
  }

  const handlePush = (): void => runGit((path) => window.api.push(path))

  /** Pulls the remembered way, or `mode`, which then becomes what Pull does. */
  const handlePull = (mode?: PullMode): void => {
    if (mode) {
      setPullMode(mode)
      savePullMode(mode)
    }
    runConflictable((path) => window.api.pull(path, mode ?? pullMode))
  }

  /** Pulls the current branch as usual; any other local branch is fast-forwarded in place. */
  const handlePullBranch = (target: RefTarget): void => {
    if (target.current) {
      handlePull()
      return
    }
    runGit(
      (path) => window.api.pullBranch(path, target.name),
      (res) => setNotice(res.updated ? `Pulled ${target.name}.` : `${target.name} is already up to date.`)
    )
  }

  const handleApplyPatch = (): void =>
    runGit(
      (path) => window.api.applyPatch(path),
      (applied) => {
        if (!applied) return
        setNotice(
          applied.conflicts
            ? `${applied.file} applied with conflicts. Resolve them in the changed files.`
            : `Applied ${applied.file}. Its changes are staged.`
        )
        goToWorkingChanges()
      }
    )

  const handleMerge = (branch: string): void => runConflictable((path) => window.api.mergeBranch(path, branch))

  const handleRebase = (branch: string): void => runConflictable((path) => window.api.rebaseOnto(path, branch))

  const handleCherryPick = (hash: string | string[]): void => runConflictable((path) => window.api.cherryPick(path, hash))

  const handleRevertCommit = (hash: string | string[]): void =>
    runConflictable((path) => window.api.revertCommit(path, hash))

  const handleResetTo = (hash: string, mode: 'soft' | 'mixed' | 'hard'): void => {
    if (!repoPath) return
    if (
      mode === 'hard' &&
      !window.confirm(
        'Hard reset will discard all uncommitted changes and move the branch pointer. This cannot be undone easily. Continue?'
      )
    ) {
      return
    }
    runGit((path) => window.api.resetTo(path, hash, mode))
  }

  const handleCreateBranchAt = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const name = await askText({ title: 'Create branch here', label: 'Branch name', submitLabel: 'Create branch' })
    if (name) runGit((path) => window.api.createBranchAt(path, name, hash))
  }

  const handleCreateTag = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const name = await askText({ title: 'Create tag here', label: 'Tag name', submitLabel: 'Create tag' })
    if (name) runGit((path) => window.api.createTag(path, name, hash))
  }

  const handleCreateAnnotatedTag = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const name = await askText({ title: 'Create annotated tag here', label: 'Tag name', submitLabel: 'Next' })
    if (!name) return
    const message = await askText({
      title: `Annotate ${name}`,
      label: 'Tag message',
      defaultValue: name,
      submitLabel: 'Create tag'
    })
    if (message !== null) runGit((path) => window.api.createAnnotatedTag(path, name, message, hash))
  }

  const handleCreatePatch = (hash: string): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.createPatchFile(repoPath, hash)
      if (!res.ok) showError(res.error)
    })
  }

  const handleCopyText = (text: string): void => {
    window.api.copyToClipboard(text)
  }

  const handleCreateWorktree = (ref: string, kind: 'local' | 'remote' | 'commit'): void =>
    runGit(
      (path) => window.api.addWorktree(path, ref, kind),
      (dir) => {
        if (dir) setNotice(`Created a worktree at ${dir}`)
      }
    )

  const handleDeleteBranch = (target: RefTarget): void => {
    if (!repoPath) return
    if (target.remote) {
      if (!window.confirm(`Delete ${target.name} from the remote? Anyone else using it will lose it too.`)) return
      runGit((path) => window.api.deleteRemoteBranch(path, target.name))
      return
    }
    withBusy(async () => {
      let res = await window.api.deleteBranch(repoPath, target.name, false)
      if (!res.ok && /not fully merged/i.test(res.error)) {
        const force = window.confirm(
          `${target.name} has commits that aren't merged anywhere else. Delete it anyway? Those commits will be lost.`
        )
        if (force) res = await window.api.deleteBranch(repoPath, target.name, true)
        else res = { ok: true, data: undefined }
      }
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleRenameBranch = async (name: string): Promise<void> => {
    if (!repoPath) return
    const next = await askText({ title: `Rename ${name}`, label: 'New branch name', defaultValue: name, submitLabel: 'Rename' })
    if (next && next !== name) runGit((path) => window.api.renameBranch(path, name, next))
  }

  const handleToggleFavourite = (name: string): void => {
    if (!repoPath) return
    const names = toggleFavourite(favourites, name)
    setFavourites(repoPath, names)
    window.api.setFavouriteBranches(repoPath, names).then((res) => !res.ok && showError(res.error))
  }

  const handleSnoozeCleanup = (): void => {
    if (!repoPath) return
    const until = repo.branchesListedAt + CLEANUP_SNOOZE_DAYS * 24 * 60 * 60 * 1000
    setCleanupSnoozedUntil(repoPath, until)
    window.api.setCleanupSnooze(repoPath, until).then((res) => !res.ok && showError(res.error))
  }

  const handleCleanupBranches = (names: string[]): void => {
    setShowCleanup(false)
    runGit(
      (path) => window.api.deleteBranches(path, names),
      ({ deleted, failed }, path) => {
        if (deleted.length > 0) {
          setBranchRestore({
            repoPath: path,
            deleted,
            message: `Deleted ${deleted.length} branch${deleted.length === 1 ? '' : 'es'}.`
          })
        }
        if (failed.length > 0) showError(`Couldn't delete ${failed.map((f) => `${f.name} (${f.error})`).join(', ')}`)
      }
    )
  }

  const handleRestoreBranches = (): void => {
    const restore = branchRestore
    if (!restore) return
    setBranchRestore(null)
    withBusy(async () => {
      const res = await window.api.restoreBranches(restore.repoPath, restore.deleted)
      if (!res.ok) showError(res.error)
      await refresh(restore.repoPath)
    })
  }

  // --- Stashes ----------------------------------------------------------------------

  const handleStash = (): void => runGit((path) => window.api.stash(path))

  const handleStashWithMessage = async (): Promise<void> => {
    if (!repoPath) return
    const message = await askText({ title: 'Stash changes', label: 'Stash message', submitLabel: 'Stash' })
    if (message !== null) runGit((path) => window.api.stash(path, message.trim() || undefined))
  }

  const handleStashPop = (): void => runGit((path) => window.api.stashPop(path))

  const stashActions = {
    apply: (stash: StashEntry): void => runGit((path) => window.api.stashApply(path, stash.ref)),
    pop: (stash: StashEntry): void => runGit((path) => window.api.stashPop(path, stash.ref)),
    drop: (stash: StashEntry): void => {
      if (!repoPath) return
      if (!window.confirm(`Delete the stash "${stash.message}"? It can't be brought back from SillyGit.`)) return
      runGit((path) => window.api.stashDrop(path, stash.ref))
    }
  }

  // --- Merges, rebases and conflicts -------------------------------------------------

  const handleContinue = (): void => {
    const message = operation?.kind === 'rebase' ? undefined : commitMessage.trim()
    runConflictable(async (path) => {
      const res = await window.api.continueOperation(path, message)
      if (res.ok && !res.data.conflicts) setCommitMessage('')
      return res
    })
  }

  const handleSkip = (): void => runConflictable((path) => window.api.skipOperation(path))

  const handleAbort = (): void => {
    if (!repoPath || !operation) return
    const ok = window.confirm(
      `Abort the ${operation.kind}? Your conflict resolutions will be lost and the branch goes back to how it was before.`
    )
    if (!ok) return
    runGit(
      (path) => window.api.abortOperation(path),
      () => {
        setCommitMessage('')
        setResolvingPath(null)
      }
    )
  }

  const handleTakeSide = (paths: string[], side: 'current' | 'incoming'): void =>
    // All or nothing, and undoable: taking a side overwrites the working file.
    runGit(
      (path) => window.api.takeSideMany(path, paths, side),
      (snapshot, path) => {
        const label = side === 'current' ? operation?.currentLabel ?? 'current' : operation?.incomingLabel ?? 'incoming'
        setConflictUndo({ repoPath: path, snapshot, message: `Took ${side} (${label}) for ${fileCount(paths.length)}.` })
        if (resolvingPath && paths.includes(resolvingPath)) setResolvingPath(null)
      }
    )

  const handleMarkResolved = (paths: string[]): void => {
    if (!repoPath) return
    withBusy(async () => {
      const marked = await window.api.pathsWithMarkers(repoPath, paths)
      if (marked.ok && marked.data.length > 0) {
        const list = marked.data.slice(0, 8).join('\n')
        const more = marked.data.length > 8 ? `\n…and ${marked.data.length - 8} more` : ''
        const ok = window.confirm(
          `${marked.data.length === 1 ? 'This file still has' : `${marked.data.length} files still have`} conflict markers:\n\n${list}${more}\n\nMark ${paths.length === 1 ? 'it' : 'them'} resolved anyway? The markers would be committed as they are.`
        )
        if (!ok) return
      }
      const res = await window.api.markResolved(repoPath, paths)
      if (!res.ok) showError(res.error)
      else if (paths.length > 1) {
        setConflictUndo({ repoPath, snapshot: res.data, message: `Marked ${fileCount(paths.length)} resolved.` })
      }
      await refresh(repoPath)
    })
  }

  const handleUndoConflictAction = (): void => {
    const undo = conflictUndo
    if (!undo) return
    setConflictUndo(null)
    withBusy(async () => {
      const res = await window.api.restoreConflicts(undo.repoPath, undo.snapshot)
      if (!res.ok) showError(res.error)
      await refresh(undo.repoPath)
    })
  }

  const handleOpenExternal = async (path: string): Promise<void> => {
    if (!repoPath || !externalToolName) return
    const repoAtStart = repoPath
    setNotice(`Opened ${path} in ${externalToolName}. Save and close it there to finish.`)
    const res = await window.api.openInMergeTool(repoAtStart, path)
    if (!res.ok) {
      setNotice(null)
      showError(res.error)
    } else if (res.data.resolved) {
      setNotice(`Resolved ${path} in ${externalToolName}.`)
      setResolvingPath((p) => (p === path ? null : p))
    } else {
      setNotice(res.data.reason ?? `${path} is still conflicted.`)
    }
    await refresh(repoAtStart)
  }

  const handleInteractiveRebase = (base: string): void => {
    if (!repoPath) return
    setFullScreenHash(null)
    setResolvingPath(null)
    closeEditor()
    setFileView(null)
    setWorkingDiff(null)
    setRebaseEditor({ repoPath, base })
  }

  /** Runs the planned rebase; resolves to false when it didn't start, so the editor stays open. */
  const handleStartRebase = async (plan: RebasePlan, steps: RebaseStep[]): Promise<boolean> => {
    if (!repoPath) return false
    setBusy(true)
    showError(null)
    setNotice(null)
    try {
      const res = await window.api.startInteractiveRebase(repoPath, plan.base.hash, plan.head, steps)
      const op = await window.api.operationState(repoPath)
      // A rebase that stopped part way (on a conflict, or a commit that came
      // out empty) goes on in the commit panel, like any other.
      const stopped = op.ok && op.data?.kind === 'rebase'
      if (!res.ok) showError(res.error)
      if (!res.ok && !stopped) return false
      setRebaseEditor(null)
      await refresh(repoPath)
      if (stopped) {
        setSelection({ type: 'working' })
      } else {
        const kept = steps.filter((s) => s.action !== 'drop' && s.action !== 'squash' && s.action !== 'fixup').length
        setNotice(`Rebased ${plan.branch}: ${plan.commits.length} commit${plan.commits.length === 1 ? '' : 's'} became ${kept}.`)
      }
      return true
    } finally {
      setBusy(false)
    }
  }

  /** What a branch or commit dropped on a branch does, picked from the drop menu. */
  const runDropAction = (source: DragSource, target: string, option: DropOption): void => {
    if (source.kind === 'commits') {
      runConflictable((path) => window.api.cherryPickOnto(path, source.hashes, target))
    } else if (option.action === 'merge') {
      runConflictable((path) => window.api.mergeInto(path, source.name, target))
    } else if (option.action === 'rebase') {
      runConflictable((path) => window.api.rebaseBranchOnto(path, source.name, target))
    } else if (option.action === 'fast-forward') {
      runGit((path) => window.api.fastForward(path, target, source.name))
    }
  }

  // --- Run ----------------------------------------------------------------------------

  // The commit Run acts on: the selected one, if just one is selected. A
  // clean HEAD is just the working tree, so that runs in the repo.
  const runCommit =
    selection.type === 'commit' && !(selection.hash === headHash && !hasWorkingChanges) ? selection.hash : null
  const runIsolated = !!runCommit && runMode === 'isolated'
  const runRunning = !!repoPath && runningKeys.includes(runKey(repoPath, runIsolated))

  /** Asks for the repo's run command (prefilled with the current one or a guess) and saves it. */
  const editRunCommand = async (): Promise<string | null> => {
    if (!repoPath) return null
    const { command, suggestion } = await window.api.getRunCommand(repoPath)
    const next = await askText({
      title: 'Run command',
      label: `Command to run in ${repoDisplayName(repoPath)}`,
      defaultValue: command ?? suggestion,
      placeholder: 'npm run dev',
      submitLabel: 'Save'
    })
    if (next == null) return null
    const res = await window.api.setRunCommand(repoPath, next)
    if (!res.ok) {
      showError(res.error)
      return null
    }
    setRunCommand(repoPath, next)
    return next
  }

  /**
   * Runs the repo's run command. With a commit selected it runs that commit:
   * in isolation (a separate checkout, leaving the working tree alone), or by
   * checking it out here first. Otherwise it runs the working tree as it is.
   */
  const handleRun = async (mode: RunMode = runMode): Promise<void> => {
    if (!repoPath || preparingRun) return
    if (mode !== runMode) {
      setRunMode(mode)
      saveRunMode(mode)
    }
    const repoAtStart = repoPath
    const command = (await window.api.getRunCommand(repoAtStart)).command ?? (await editRunCommand())
    if (!command) return
    const commit = runCommit
    const isolated = !!commit && mode === 'isolated'
    if (commit && !isolated && commit !== headHash) {
      if (hasWorkingChanges) {
        showError('Commit or stash your changes before checking out another commit, or choose Run in isolation.')
        return
      }
      let checkedOut = false
      await withBusy(async () => {
        const res = await window.api.checkout(repoAtStart, commit)
        if (!res.ok) showError(res.error)
        else checkedOut = true
        await refresh(repoAtStart)
      })
      if (!checkedOut) return
    }
    setPreparingRun(true)
    showError(null)
    try {
      const res = await window.api.planRun(repoAtStart, isolated ? commit : null)
      if (!res.ok) {
        showError(res.error)
        return
      }
      const name = repoDisplayName(repoAtStart)
      terminalRef.current?.startRun({
        key: runKey(repoAtStart, isolated),
        title: isolated ? `Run ${name} @ ${commit!.slice(0, 7)} (isolated)` : `Run ${name}`,
        cwd: res.data.cwd,
        script: res.data.script
      })
      setShowTerminal(true)
    } finally {
      setPreparingRun(false)
    }
  }

  const handleStopRun = (): void => {
    if (repoPath) terminalRef.current?.stopRun(runKey(repoPath, runIsolated))
  }

  // --- Menus and shortcuts -------------------------------------------------------------

  const refActions: RefActions = {
    checkout: handleCheckout,
    checkoutRemote: handleCheckoutRemote,
    merge: handleMerge,
    rebase: handleRebase,
    createWorktree: handleCreateWorktree,
    createBranchAt: handleCreateBranchAt,
    cherryPick: handleCherryPick,
    interactiveRebase: handleInteractiveRebase,
    canInteractiveRebase: (hash) => !!status?.branch && hash !== headHash && repo.headAncestors.has(hash),
    resetTo: handleResetTo,
    revertCommit: handleRevertCommit,
    deleteBranch: handleDeleteBranch,
    renameBranch: handleRenameBranch,
    pull: handlePullBranch,
    createTag: handleCreateTag,
    createAnnotatedTag: handleCreateAnnotatedTag,
    createPatch: handleCreatePatch,
    copyText: handleCopyText,
    openUrl: (url) => {
      window.api.openExternal(url).then((res) => !res.ok && showError(res.error))
    },
    startPullRequest: async (compareUrl, base, head, headBranch) => {
      if (!repoPath) return
      // Prefill from the commits by rule; fall back to the bare form if that fails.
      const res = await window.api.quickPullRequestText(repoPath, base, head, headBranch)
      const url = res.ok ? withPullRequestText(compareUrl, res.data) : compareUrl
      window.api.openExternal(url).then((r) => !r.ok && showError(r.error))
    },
    remoteInfo: (target) => resolveBranchRemote(target, branches, remotes, pullRequests),
    isFavourite: (name) => favourites.includes(name),
    toggleFavourite: handleToggleFavourite,
    revalidate: revalidatePullRequests
  }

  const multiActions = {
    cherryPick: (hashes: string[]) => handleCherryPick(hashes),
    revert: (hashes: string[]) => handleRevertCommit(hashes),
    copyText: handleCopyText,
    select: (hash: string) => setSelection({ type: 'commit', hash })
  }

  const commands = (): ReturnType<typeof paletteCommands> =>
    paletteCommands({
      repoPath,
      status,
      branches,
      hasRemotes: remotes.length > 0,
      stashes,
      operation,
      undoLabel,
      redoLabel,
      hasWorkingChanges,
      canRunCommit: !!runCommit,
      trackedFiles,
      tabPinned: !!repoPath && pinnedTabs.includes(repoPath),
      tabCount: tabs.length,
      recentRepos,
      showClaude,
      showTerminal,
      showLaunchpad,
      canSelfUpdate: !!selfUpdate?.status.supported,
      actions: {
        undo: handleUndo,
        redo: handleRedo,
        fetch: handleFetch,
        pull: handlePull,
        push: handlePush,
        focusSearch,
        goToWorkingChanges,
        startAmend,
        run: (mode) => void handleRun(mode),
        editRunCommand: () => void editRunCommand(),
        openFileView: (path, mode) => openFileView(path, null, mode),
        applyPatch: handleApplyPatch,
        stash: handleStash,
        stashWithMessage: handleStashWithMessage,
        applyStash: stashActions.apply,
        popStash: stashActions.pop,
        createBranch: promptCreateBranch,
        cleanUpBranches: () => setShowCleanup(true),
        checkout: handleCheckout,
        checkoutRemote: handleCheckoutRemote,
        merge: handleMerge,
        rebase: handleRebase,
        deleteBranch: (name) => handleDeleteBranch({ name, remote: false, current: false }),
        renameBranch: handleRenameBranch,
        continueOperation: handleContinue,
        abortOperation: handleAbort,
        closeTab: (path) => closeTabs([path]),
        togglePinTab,
        toggleClaude: () => setShowClaude((v) => !v),
        revealRepo: (path) => {
          window.api.openPath(path).then((res) => {
            if (!res.ok) showError(res.error)
          })
        },
        copyText: handleCopyText,
        showActivity: () => setShowActivity(true),
        showUpdate: () => setShowUpdate(true),
        toggleLaunchpad: () => setShowLaunchpad((v) => !v),
        cycleTab: handleCycleTab,
        clone: handleClone,
        toggleTerminal: () => setShowTerminal((v) => !v),
        openRepo: handleOpenRepo,
        openRecentRepo: (path) => handleOpenRecentRepo(path),
        openSettings: () => setShowSettings(true)
      }
    })

  // App-wide shortcuts. An effect event sees current state without
  // re-registering the listener on every render.
  const onShortcut = useEffectEvent((e: KeyboardEvent): void => {
    if (promptDialog || showSettings || showActivity) return
    const key = e.key.toLowerCase()
    if ((isPrimary(e) && key === 'k') || (isPrimary(e, true) && key === 'p')) {
      e.preventDefault()
      setPalette((v) => (v ? null : 'modal'))
      return
    }
    if (palette) return
    if (isPrimary(e) && key === 'f' && repoPath) {
      e.preventDefault()
      focusSearch()
    } else if (isPrimary(e) && key === 'z' && !isTyping(e.target) && repoPath) {
      e.preventDefault()
      if (!busy) handleUndo()
    } else if (isPrimary(e, true) && key === 'z' && !isTyping(e.target) && repoPath) {
      e.preventDefault()
      if (!busy) handleRedo()
    } else if (isPrimary(e) && (key === 'o' || key === 't')) {
      e.preventDefault()
      handleOpenRepo()
    } else if (e.key === 'Tab' && e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      handleCycleTab(e.shiftKey ? -1 : 1)
    } else if (isPrimary(e, true) && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault()
      handleCycleTab(e.code === 'BracketLeft' ? -1 : 1)
    } else if (isPrimary(e) && /^Digit[1-9]$/.test(e.code) && tabs.length > 0) {
      e.preventDefault()
      const target = tabForDigit(tabs, Number(e.code.slice(5)))
      if (target) selectTab(target)
    } else if (isPrimary(e) && key === ',') {
      e.preventDefault()
      setShowSettings(true)
    }
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => onShortcut(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // --- Rendering ----------------------------------------------------------------------

  const activeFile: ActiveFile | null = fileView
    ? { path: fileView.path, staged: workingDiff?.path === fileView.path ? workingDiff.staged : !status?.unstaged.some((f) => f.path === fileView.path) }
    : workingDiff
  const workingDiffFile = workingDiff
    ? (workingDiff.staged ? status?.staged : status?.unstaged)?.find((f) => f.path === workingDiff.path)
    : undefined
  const detailPanel =
    repoPath && selection.type !== 'none' ? (
      <div className="detail-panel" role="complementary" aria-label="Details">
        <DetailPanel
          repoPath={repoPath}
          selection={selection}
          lookupCommit={(hash) => commitByHash.get(hash)}
          multiActions={multiActions}
          amend={amend}
          onAmendChange={handleAmendChange}
          status={status}
          commitMessage={commitMessage}
          onCommitMessageChange={setCommitMessage}
          onStage={handleStage}
          onUnstage={handleUnstage}
          onDiscard={handleDiscard}
          onCommit={handleCommit}
          onOpenCommitFileDiff={openCommitFile}
          onOpenWorkingFile={openWorkingFile}
          activeFile={activeFile}
          operation={operation}
          conflictActions={{
            onOpenConflict: setResolvingPath,
            onTakeSide: handleTakeSide,
            onMarkResolved: handleMarkResolved,
            externalToolName,
            onOpenExternal: (path) => void handleOpenExternal(path),
            onContinue: handleContinue,
            onAbort: handleAbort,
            onSkip: handleSkip
          }}
          onEditFile={openEditor}
          onOpenFileView={openFileView}
          onCopyText={handleCopyText}
        />
      </div>
    ) : null

  const mainView = (): JSX.Element => {
    if (showLaunchpad) {
      return (
        <Launchpad
          repoPath={repoPath}
          openRepos={tabs}
          onClose={() => setShowLaunchpad(false)}
          onOpenTerminal={() => setShowTerminal(true)}
        />
      )
    }
    if (!repoPath) {
      return (
        <EmptyState
          recentRepos={recentRepos}
          onOpenRepo={handleOpenRepo}
          onOpenRecentRepo={(path) => handleOpenRecentRepo(path)}
        />
      )
    }
    if (resolvingPath) {
      return (
        <MergeResolver
          key={`${repoPath}\0${resolvingPath}`}
          repoPath={repoPath}
          path={resolvingPath}
          onClose={() => setResolvingPath(null)}
          onResolved={(message) => {
            setResolvingPath(null)
            setNotice(message ?? null)
            refresh(repoPath)
          }}
          onError={showError}
          externalToolName={externalToolName}
          onOpenExternal={(path) => void handleOpenExternal(path)}
        />
      )
    }
    if (rebaseBase) {
      return (
        <InteractiveRebase
          key={rebaseBase}
          repoPath={repoPath}
          base={rebaseBase}
          onClose={() => setRebaseEditor(null)}
          onStart={handleStartRebase}
        />
      )
    }
    if (fileView) {
      return (
        <div className="main-layout file-focus">
          <FileHistoryView
            key={`${repoPath}\0${fileViewOpens}`}
            repoPath={repoPath}
            target={fileView}
            onClose={() => setFileView(null)}
            onShowDiff={fileViewDiff()}
            onModeChange={(mode) => {
              fileViewMode.current = mode
            }}
            onOpenCommit={(hash, path) => {
              setFileView(null)
              setWorkingDiff(null)
              closeEditor()
              setFullScreenHash(hash)
              setFullScreenPath(path)
              setSelection({ type: 'commit', hash })
            }}
            onShowInGraph={showCommitInGraph}
            onCopyText={handleCopyText}
            onEditFile={(path) => {
              setFileView(null)
              setWorkingDiff(null)
              openEditor(path)
            }}
            onWorkingTreeChanged={() => refresh(repoPath)}
          />
          {(selection.type === 'working' || selection.type === 'commit') && detailPanel}
        </div>
      )
    }
    if (editingPath) {
      const draftKey = `${repoPath}\0${editingPath}`
      return (
        <div className="main-layout">
          <Suspense fallback={<div className="file-editor" />}>
            <FileEditor
              key={draftKey}
              repoPath={repoPath}
              path={editingPath}
              loadDraft={() => editorDrafts.current.get(draftKey)}
              onDraftChange={(draft) => {
                if (draft == null) editorDrafts.current.delete(draftKey)
                else editorDrafts.current.set(draftKey, draft)
              }}
              onClose={closeEditor}
              onSaved={() => refresh(repoPath)}
              onOpenFileView={(path, mode) => openFileView(path, null, mode)}
            />
          </Suspense>
          {detailPanel}
        </div>
      )
    }
    if (workingDiff && selection.type === 'working') {
      return (
        <div className="main-layout file-focus">
          <WorkingFileView
            repoPath={repoPath}
            path={workingDiff.path}
            staged={workingDiff.staged}
            untracked={workingDiffFile?.untracked ?? false}
            refreshKey={status}
            onClose={() => setWorkingDiff(null)}
            onStage={handleStage}
            onUnstage={handleUnstage}
            onEditFile={openEditor}
            onOpenFileView={openFileView}
            onWorkingTreeChanged={() => refresh(repoPath)}
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
          initialPath={fullScreenPath}
          isHead={fullScreenHash === headHash}
          onClose={() => {
            setFullScreenHash(null)
            refresh(repoPath)
          }}
          onNavigateToCommit={(hash) => {
            setFullScreenHash(hash)
            setFullScreenPath(null)
            setSelection({ type: 'commit', hash })
          }}
          onWorkingTreeChanged={() => refresh(repoPath)}
          onEditFile={openEditor}
          onOpenFileView={openFileView}
          onCopyText={handleCopyText}
        />
      )
    }
    return (
      <div className="main-layout">
        <Sidebar
          branches={branches}
          headHash={headHash}
          onCheckout={handleCheckout}
          onCreateBranch={handleCreateBranch}
          onSelectCommit={handleSelectBranchCommit}
          actions={refActions}
          stashes={stashes}
          stashActions={stashActions}
          favourites={favourites}
          onToggleFavourite={handleToggleFavourite}
          branchListSettings={branchListSettings}
          listedAt={repo.branchesListedAt}
          cleanupSnoozed={cleanupSnoozed}
          onOpenCleanup={() => setShowCleanup(true)}
          onSnoozeCleanup={handleSnoozeCleanup}
        />
        <CommitGraph
          repoPath={repoPath}
          rows={graphRows}
          selection={selection}
          hasWorkingChanges={hasWorkingChanges}
          wipConflictLabel={wipConflictLabel}
          headHash={headHash}
          currentBranch={status?.branch ?? null}
          branches={branches}
          onSelectWorking={() =>
            // Clicking the selected row again deselects it and closes the side bar.
            setSelection(selection.type === 'working' ? { type: 'none' } : { type: 'working' })
          }
          onClickCommit={handleClickCommit}
          onJumpToCommit={jumpToCommit}
          onCheckout={handleCheckout}
          actions={refActions}
          hasMore={repo.hasMore}
          loadingMore={repo.loadingMore}
          onLoadMore={repo.loadMore}
          searchFocusToken={searchFocusToken}
          refColumnWidth={layout.refColumnWidth}
          sprints={sprintSettings}
          mergeAnimation={mergeAnimation}
          onRefColumnWidthChange={layout.setRefColumnWidth}
        />
        {detailPanel}
      </div>
    )
  }

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        pinned={pinnedTabs}
        activeTab={repoPath}
        launchpadActive={showLaunchpad}
        onSelect={selectTab}
        onClose={closeTabs}
        onNewTab={handleOpenRepo}
        onOpenLaunchpad={() => setShowLaunchpad(true)}
        onTogglePin={togglePinTab}
        onMove={handleMoveTab}
        onCopyPath={handleCopyText}
      />
      <TopBar
        repoPath={repoPath}
        status={status}
        branches={branches}
        busy={busy}
        onOpenRepo={handleOpenRepo}
        recentRepos={recentRepos}
        onOpenRecentRepo={(path) => handleOpenRecentRepo(path, true)}
        onPush={handlePush}
        onPull={handlePull}
        pullMode={pullMode}
        onFetch={handleFetch}
        fetching={repo.fetching}
        hasRemotes={remotes.length > 0}
        undoLabel={undoLabel}
        onUndo={handleUndo}
        redoLabel={redoLabel}
        onRedo={handleRedo}
        onCreateBranch={promptCreateBranch}
        hasChanges={!!status && (status.staged.length > 0 || status.unstaged.length > 0) && !operation}
        stashCount={stashes.length}
        actionsOpen={palette === 'dropdown'}
        onToggleActions={() => setPalette((v) => (v === 'dropdown' ? null : 'dropdown'))}
        onStash={handleStash}
        onStashPop={handleStashPop}
        onCheckout={handleCheckout}
        onOpenSettings={() => setShowSettings(true)}
        runCommand={runCommand}
        runCommit={runCommit}
        runMode={runMode}
        running={runRunning}
        preparingRun={preparingRun}
        onRun={(mode) => void handleRun(mode)}
        onStopRun={handleStopRun}
        onEditRunCommand={() => void editRunCommand()}
        terminalVisible={showTerminal}
        onToggleTerminal={() => setShowTerminal((v) => !v)}
        claudeVisible={showClaude}
        onToggleClaude={() => setShowClaude((v) => !v)}
        selfUpdate={selfUpdate?.status ?? NO_SELF_UPDATE}
        updating={!!selfUpdate?.step}
        onOpenUpdate={() => setShowUpdate(true)}
      />
      <StatusBanners
        error={error}
        onDismissError={() => showError(null)}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        undoMessage={conflictUndo && conflictUndo.repoPath === repoPath ? conflictUndo.message : null}
        onUndo={handleUndoConflictAction}
        onDismissUndo={() => setConflictUndo(null)}
        restoreMessage={branchRestore && branchRestore.repoPath === repoPath ? branchRestore.message : null}
        onRestore={handleRestoreBranches}
        onDismissRestore={() => setBranchRestore(null)}
      />
      <div className="workspace-row">
        <div className="workspace">
          <div className="workspace-main">{mainView()}</div>
          <TerminalPanel
            ref={terminalRef}
            onRunningChange={setRunningKeys}
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
      {showCleanup && repoPath && (
        <BranchCleanupDialog
          repoPath={repoPath}
          favourites={favourites}
          settings={branchListSettings}
          nowMs={repo.branchesListedAt}
          onDelete={handleCleanupBranches}
          onClose={() => setShowCleanup(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          autoFetchMinutes={autoFetchMinutes ?? 0}
          onAutoFetchChange={setAutoFetchMinutes}
          sprints={sprintSettings}
          onSprintsChange={setSprintSettings}
          branchList={branchListSettings}
          onBranchListChange={setBranchListSettings}
          mergeTool={mergeToolSettings}
          onMergeToolChange={setMergeToolSettings}
          mergeAnimation={mergeAnimation}
          onMergeAnimationChange={setMergeAnimation}
        />
      )}
      {palette && (
        // The commands' run handlers touch refs, but only when picked, never while rendering.
        // eslint-disable-next-line react-hooks/refs
        <CommandPalette commands={commands()} variant={palette} onClose={() => setPalette(null)} />
      )}
      {showUpdate && selfUpdate?.status.supported && (
        <UpdateDialog status={selfUpdate.status} step={selfUpdate.step} onClose={() => setShowUpdate(false)} />
      )}
      {showActivity && <ActivityLog repoPath={repoPath} onClose={() => setShowActivity(false)} />}
      {promptDialog}
      <RefDropMenu repoPath={repoPath} onError={showError} onPick={runDropAction} />
    </div>
  )
}
