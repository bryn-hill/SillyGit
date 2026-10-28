import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type {
  BranchInfo,
  OpenPullRequest,
  RepoRemote,
  ConflictableResult,
  FileStatus,
  GraphCommit,
  OperationState,
  RepoStatus,
  CommitSearchHit,
  PullMode,
  StashEntry
} from '../../shared/types'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import Sidebar from './components/Sidebar'
import CommitGraph, { DEFAULT_REF_COLUMN_WIDTH } from './components/CommitGraph'
import DetailPanel from './components/DetailPanel'
import CommitFullView from './components/CommitFullView'
import FileHistoryView, { type FileViewMode, type FileViewTarget } from './components/FileHistoryView'
import MergeResolver from './components/MergeResolver'
import InteractiveRebase from './components/InteractiveRebase'
import type { RebasePlan, RebaseStep } from '../../shared/rebase'
import Launchpad from './components/Launchpad'
import SettingsModal from './components/SettingsModal'
import PromptDialog, { type PromptRequest } from './components/PromptDialog'
import TerminalPanel, {
  DEFAULT_HEIGHT as DEFAULT_TERMINAL_HEIGHT,
  type TerminalPanelHandle
} from './components/TerminalPanel'
import type { RunMode } from '../../shared/run'
import ClaudePanel, { DEFAULT_CLAUDE_WIDTH } from './components/claude/ClaudePanel'
import { layoutGraph } from './lib/graphLayout'
import { repoDisplayName } from './lib/repoName'
import { resolveBranchRemote } from '../../shared/branchRemote'
import type { RefActions, RefTarget } from './components/RefContextMenu'
import { withPullRequestText } from '../../shared/quickActions'
import { DEFAULT_SPRINT_SETTINGS, type SprintSettings } from '../../shared/sprints'
import { DEFAULT_MERGE_TOOL_SETTINGS, mergeToolName, type MergeToolSettings } from '../../shared/mergeTools'
import type { ConflictSnapshot } from '../../shared/types'
import CommandPalette, { type Command } from './components/CommandPalette'
import ActivityLog from './components/ActivityLog'
import ContextMenu from './components/ContextMenu'
import RefDragLayer from './components/RefDrag'
import { shortRef } from './components/RefContextMenu'
import { dropOptions, type DragSource, type DropOption } from './lib/refDrag'
import type { ClickModifiers } from './components/CommitGraph'
import { clickCommit } from './lib/selection'
import { isPrimary, isTyping, MOD } from './lib/shortcuts'
import logo from './assets/logo.png'

// Monaco is several MB, so the editor loads the first time a file is opened in it.
const FileEditor = lazy(() => import('./components/FileEditor'))

// Commits loaded per page; the graph loads another page as you scroll near the end.
const GRAPH_PAGE = 500

// 'none' means nothing is selected and the side bar is closed. 'commits' is a
// multi-selection (newest first); `anchor` is where a Shift-click range starts.
export type Selection =
  | { type: 'none' }
  | { type: 'working' }
  | { type: 'commit'; hash: string }
  | { type: 'commits'; hashes: string[]; anchor: string }

/** What a repo tab last showed, so switching back to it is instant. */
interface TabSnapshot {
  status: RepoStatus | null
  branches: BranchInfo[]
  graphCommits: GraphCommit[]
  operation: OperationState | null
  remotes: RepoRemote[]
  stashes: StashEntry[]
  undoLabel: string | null
  redoLabel: string | null
  selection?: Selection
}

const PULL_MODE_KEY = 'sillygit.pullMode'

function loadPullMode(): PullMode {
  try {
    const saved = localStorage.getItem(PULL_MODE_KEY)
    if (saved === 'ff' || saved === 'ff-only' || saved === 'rebase') return saved
  } catch {
    // Storage can be unavailable; fall back to the default.
  }
  return 'ff'
}

function savePullMode(mode: PullMode): void {
  try {
    localStorage.setItem(PULL_MODE_KEY, mode)
  } catch {
    // Not remembering it is fine.
  }
}

const RUN_MODE_KEY = 'sillygit.runMode'

function loadRunMode(): RunMode {
  try {
    if (localStorage.getItem(RUN_MODE_KEY) === 'checkout') return 'checkout'
  } catch {
    // Storage can be unavailable; fall back to the default.
  }
  return 'isolated'
}

function saveRunMode(mode: RunMode): void {
  try {
    localStorage.setItem(RUN_MODE_KEY, mode)
  } catch {
    // Not remembering it is fine.
  }
}

/** Identifies a repo's run in the terminal: its working tree, or its isolated checkout. */
export const runKey = (repoPath: string, isolated: boolean): string => `${repoPath}\0${isolated ? 'isolated' : 'tree'}`

export default function App(): JSX.Element {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [remotes, setRemotes] = useState<RepoRemote[]>([])
  const [pullRequests, setPullRequests] = useState<OpenPullRequest[]>([])
  const [graphCommits, setGraphCommits] = useState<GraphCommit[]>([])
  const [selection, setSelection] = useState<Selection>({ type: 'working' })
  const [commitMessage, setCommitMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The last bulk conflict action (take a side, mark resolved), for Undo.
  const [conflictUndo, setConflictUndo] = useState<{ repoPath: string; snapshot: ConflictSnapshot; message: string } | null>(
    null
  )
  const [operation, setOperation] = useState<OperationState | null>(null)
  const [resolvingPath, setResolvingPath] = useState<string | null>(null)
  // The interactive rebase being planned, and the repo it's for.
  const [rebaseEditor, setRebaseEditor] = useState<{ repoPath: string; base: string } | null>(null)
  const rebaseBase = rebaseEditor && rebaseEditor.repoPath === repoPath ? rebaseEditor.base : null
  // The file open in the editor, per repo tab, and unsaved text left in files
  // whose editor was hidden (tab switch, Launchpad, another file opened).
  const [editingFiles, setEditingFiles] = useState<Record<string, string>>({})
  const editorDrafts = useRef(new Map<string, string>())
  const [busy, setBusy] = useState(false)
  const [fullScreenHash, setFullScreenHash] = useState<string | null>(null)
  const [fullScreenPath, setFullScreenPath] = useState<string | null>(null)
  /** A file's history or blame, shown in place of the graph. */
  const [fileView, setFileView] = useState<FileViewTarget | null>(null)
  /** Tracked files, loaded when the Actions list opens, for its Blame and File history pickers. */
  const [trackedFiles, setTrackedFiles] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [prompt, setPrompt] = useState<(PromptRequest & { resolve: (value: string | null) => void }) | null>(null)
  const [showLaunchpad, setShowLaunchpad] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const [showClaude, setShowClaude] = useState(false)
  const [claudeWidth, setClaudeWidth] = useState(DEFAULT_CLAUDE_WIDTH)
  const [refColumnWidth, setRefColumnWidth] = useState(DEFAULT_REF_COLUMN_WIDTH)
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  // Repos open as tabs, pinned ones first; repoPath is the active one.
  const [tabs, setTabs] = useState<string[]>([])
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([])
  const [graphLimit, setGraphLimit] = useState(GRAPH_PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [undoLabel, setUndoLabel] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [amend, setAmend] = useState(false)
  const [redoLabel, setRedoLabel] = useState<string | null>(null)
  // Cmd+K opens the palette in the middle of the window; the toolbar's
  // Actions button opens the same list hanging under it.
  const [palette, setPalette] = useState<'modal' | 'dropdown' | null>(null)
  const showPalette = palette !== null
  const [showActivity, setShowActivity] = useState(false)
  const terminalRef = useRef<TerminalPanelHandle | null>(null)
  const [runningKeys, setRunningKeys] = useState<string[]>([])
  const [runMode, setRunMode] = useState<RunMode>(loadRunMode)
  const [preparingRun, setPreparingRun] = useState(false)
  // The repo's Run command, or null until one is set.
  const [runCommand, setRunCommand] = useState<string | null>(null)
  const [pullMode, setPullMode] = useState<PullMode>(loadPullMode)
  // Minutes between background fetches (0 = off), from settings.
  const [autoFetchMinutes, setAutoFetchMinutes] = useState<number | null>(null)
  const [searchFocusToken, setSearchFocusToken] = useState(0)
  // Layout changes are saved only once the previous session has been restored,
  // so the defaults never overwrite it.
  const [sessionRestored, setSessionRestored] = useState(false)

  useEffect(() => {
    window.api.getAutoFetchMinutes().then(setAutoFetchMinutes)
  }, [])

  const handleAutoFetchChange = (minutes: number): void => {
    setAutoFetchMinutes(minutes)
    window.api.setAutoFetchMinutes(minutes).then((res) => !res.ok && showError(res.error))
  }

  // Sprint markers on the graph, from settings (off by default).
  const [sprintSettings, setSprintSettings] = useState<SprintSettings>(DEFAULT_SPRINT_SETTINGS)

  useEffect(() => {
    window.api.getSprintSettings().then(setSprintSettings)
  }, [])

  const [mergeToolSettings, setMergeToolSettings] = useState<MergeToolSettings>(DEFAULT_MERGE_TOOL_SETTINGS)
  useEffect(() => {
    window.api.getMergeToolSettings().then(setMergeToolSettings)
  }, [])
  const externalToolName = mergeToolName(mergeToolSettings)
  // Undo only makes sense while the merge (or rebase…) that the files belong to is still going.
  useEffect(() => {
    if (!operation) setConflictUndo(null)
  }, [operation])

  const handleMergeToolChange = (next: MergeToolSettings): void => {
    setMergeToolSettings(next)
    window.api.setMergeToolSettings(next).then((res) => !res.ok && showError(res.error))
  }

  const handleSprintSettingsChange = (next: SprintSettings): void => {
    setSprintSettings(next)
    window.api.setSprintSettings(next).then((res) => !res.ok && showError(res.error))
  }

  // Reopen whatever was open when the app last quit.
  useEffect(() => {
    window.api.getSession().then((session) => {
      const { layout } = session
      if (layout.showTerminal !== undefined) setShowTerminal(layout.showTerminal)
      if (layout.terminalHeight) setTerminalHeight(layout.terminalHeight)
      if (layout.showClaude !== undefined) setShowClaude(layout.showClaude)
      if (layout.claudeWidth) setClaudeWidth(layout.claudeWidth)
      if (layout.refColumnWidth) setRefColumnWidth(layout.refColumnWidth)
      setRecentRepos(session.recentRepos)
      setTabs(session.openTabs)
      setPinnedTabs(session.pinnedTabs)
      if (session.repoPath) setRepoPath(session.repoPath)
      if (session.missingRepo) {
        setNotice(`Couldn't reopen ${session.missingRepo}: the folder is gone or is no longer a git repository.`)
        window.api.forgetRecentRepo(session.missingRepo)
      }
      setSessionRestored(true)
    })
  }, [])

  useEffect(() => {
    if (!sessionRestored) return
    const timer = setTimeout(() => {
      window.api.saveLayout({ showTerminal, terminalHeight, showClaude, claudeWidth, refColumnWidth })
    }, 300)
    return () => clearTimeout(timer)
  }, [sessionRestored, showTerminal, terminalHeight, showClaude, claudeWidth, refColumnWidth])

  // Saved straight away (tabs change rarely) so a quick quit never loses one.
  useEffect(() => {
    if (sessionRestored) window.api.saveTabs({ openTabs: tabs, pinnedTabs, activeTab: repoPath })
  }, [sessionRestored, tabs, pinnedTabs, repoPath])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'Backquote' && e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        setShowTerminal((v) => !v)
      } else if (e.key === 'Escape' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        setShowClaude((v) => !v)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  const showError = (message: string): void => setError(message)

  /** Asks for one line of text in a dialog; resolves to null when cancelled. */
  const askText = (request: PromptRequest): Promise<string | null> =>
    new Promise((resolve) => setPrompt({ ...request, resolve }))

  // Refreshes can overlap (a watcher event during a commit, say); only the
  // newest one's answers are applied, and never one for a repo that's closed.
  const graphLimitRef = useRef(GRAPH_PAGE)
  const refreshSeq = useRef(0)
  const openRepo = useRef<string | null>(null)
  openRepo.current = repoPath
  const tabSnapshots = useRef(new Map<string, TabSnapshot>())

  const refresh = useCallback(async (path: string) => {
    const seq = ++refreshSeq.current
    const [statusRes, branchesRes, graphRes, operationRes, remotesRes, stashesRes, undoRes, redoRes] = await Promise.all([
      window.api.getStatus(path),
      window.api.branches(path),
      window.api.graphLog(path, graphLimitRef.current),
      window.api.operationState(path),
      window.api.remotes(path),
      window.api.stashes(path),
      window.api.undoLabel(path),
      window.api.redoLabel(path)
    ])
    if (seq !== refreshSeq.current || openRepo.current !== path) return
    setRemotes(remotesRes.ok ? remotesRes.data : [])
    if (statusRes.ok) setStatus(statusRes.data)
    else showError(statusRes.error)
    setOperation(operationRes.ok ? operationRes.data : null)
    if (branchesRes.ok) setBranches(branchesRes.data)
    if (graphRes.ok) setGraphCommits(graphRes.data)
    setStashes(stashesRes.ok ? stashesRes.data : [])
    setUndoLabel(undoRes.ok ? undoRes.data : null)
    setRedoLabel(redoRes.ok ? redoRes.data : null)
    const previous = tabSnapshots.current.get(path)
    tabSnapshots.current.set(path, {
      status: statusRes.ok ? statusRes.data : (previous?.status ?? null),
      branches: branchesRes.ok ? branchesRes.data : (previous?.branches ?? []),
      graphCommits: graphRes.ok ? graphRes.data : (previous?.graphCommits ?? []),
      operation: operationRes.ok ? operationRes.data : null,
      remotes: remotesRes.ok ? remotesRes.data : [],
      stashes: stashesRes.ok ? stashesRes.data : [],
      undoLabel: undoRes.ok ? undoRes.data : null,
      redoLabel: redoRes.ok ? redoRes.data : null,
      selection: previous?.selection
    })
  }, [])

  // A different repo (tab) is showing: put up what it showed last time, or
  // nothing, so another repo's commits never show under its name, then refresh.
  useEffect(() => {
    graphLimitRef.current = GRAPH_PAGE
    setGraphLimit(GRAPH_PAGE)
    setAmend(false)
    const snapshot = repoPath ? tabSnapshots.current.get(repoPath) : undefined
    setStatus(snapshot?.status ?? null)
    setBranches(snapshot?.branches ?? [])
    setGraphCommits(snapshot?.graphCommits ?? [])
    setOperation(snapshot?.operation ?? null)
    setRemotes(snapshot?.remotes ?? [])
    setStashes(snapshot?.stashes ?? [])
    setUndoLabel(snapshot?.undoLabel ?? null)
    setRedoLabel(snapshot?.redoLabel ?? null)
    setSelection(snapshot?.selection ?? { type: 'working' })
    setFullScreenHash(null)
    setFileView(null)
    setResolvingPath(null)
    if (repoPath) refresh(repoPath)
  }, [repoPath, refresh])

  // Remember each tab's selection for when it's switched back to.
  useEffect(() => {
    const snapshot = repoPath ? tabSnapshots.current.get(repoPath) : undefined
    if (snapshot) snapshot.selection = selection
  }, [repoPath, selection])

  /** Loads the graph up to `limit` commits, e.g. to scroll further or reach a search result. */
  const loadGraph = useCallback(
    async (limit: number): Promise<void> => {
      if (!repoPath || limit <= graphLimitRef.current) return
      graphLimitRef.current = limit
      setGraphLimit(limit)
      setLoadingMore(true)
      const res = await window.api.graphLog(repoPath, limit)
      setLoadingMore(false)
      if (res.ok && openRepo.current === repoPath && graphLimitRef.current === limit) setGraphCommits(res.data)
    },
    [repoPath]
  )

  const hasMoreCommits = graphCommits.length >= graphLimit
  const handleLoadMore = useCallback(() => {
    loadGraph(graphLimitRef.current + GRAPH_PAGE)
  }, [loadGraph])

  // Pick up changes made outside SillyGit: the terminal, an editor, another
  // Git tool. The main process watches the repo and batches bursts.
  useEffect(() => {
    window.api.watchRepo(repoPath)
    if (!repoPath) return
    const off = window.api.onRepoChanged((path) => {
      if (path === repoPath) refresh(repoPath)
    })
    const onFocus = (): void => {
      refresh(repoPath)
    }
    window.addEventListener('focus', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [repoPath, refresh])

  const runFetch = useCallback(
    async (quiet: boolean): Promise<void> => {
      if (!repoPath) return
      setFetching(true)
      const res = await window.api.fetch(repoPath)
      setFetching(false)
      if (!res.ok && !quiet) showError(res.error)
      if (openRepo.current === repoPath) await refresh(repoPath)
    },
    [repoPath, refresh]
  )

  // Fetch quietly when a repo opens and every few minutes after (see
  // Settings), so ahead and behind counts and remote branches stay current.
  // Failures (offline, no credentials) are ignored here; the Fetch button
  // reports them.
  useEffect(() => {
    if (!repoPath || !autoFetchMinutes) return
    const first = setTimeout(() => runFetch(true), 3000)
    const timer = setInterval(() => runFetch(true), autoFetchMinutes * 60 * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [repoPath, runFetch, autoFetchMinutes])

  // Open pull requests come from GitHub via gh, which takes a second or two.
  // Stale-while-revalidate: the branch menu shows the cached list straight
  // away, and opening it (or focusing the window) refetches in the
  // background, so the menu updates in place if anything changed.
  const prFetch = useRef<{ repo: string | null; inFlight: boolean }>({ repo: null, inFlight: false })
  const revalidatePullRequests = useCallback(() => {
    const state = prFetch.current
    if (!repoPath || state.inFlight) return
    state.repo = repoPath
    state.inFlight = true
    window.api.openPullRequests(repoPath).then((res) => {
      state.inFlight = false
      // Ignore a late answer for a repo that's no longer open.
      if (res.ok && prFetch.current.repo === repoPath) setPullRequests(res.data)
    })
  }, [repoPath])

  useEffect(() => {
    setPullRequests([])
    prFetch.current = { repo: null, inFlight: false }
    revalidatePullRequests()
    window.addEventListener('focus', revalidatePullRequests)
    return () => window.removeEventListener('focus', revalidatePullRequests)
  }, [revalidatePullRequests])

  // Claude's edits and commands land in bursts; refresh once they settle.
  const claudeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleClaudeFilesChanged = useCallback(() => {
    if (!repoPath) return
    if (claudeRefreshTimer.current) clearTimeout(claudeRefreshTimer.current)
    claudeRefreshTimer.current = setTimeout(() => refresh(repoPath), 400)
  }, [repoPath, refresh])

  const graphRows = useMemo(() => layoutGraph(graphCommits), [graphCommits])

  const headHash = useMemo(
    () => graphCommits.find((c) => c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD ->')))?.hash ?? null,
    [graphCommits]
  )

  const conflictCount = status?.conflicted.length ?? 0
  // Amending can reword the last commit with nothing changed, so the WIP row
  // (where the commit box lives) stays while Amend is on.
  const hasWorkingChanges =
    !!status &&
    (status.staged.length > 0 || status.unstaged.length > 0 || conflictCount > 0 || !!operation || amend)

  // Prefill the commit message with git's prepared merge message, once per
  // operation, without overwriting anything the user typed.
  const prefilledFor = useRef<string | null>(null)
  useEffect(() => {
    const key = operation ? `${operation.kind}:${operation.incomingLabel}` : null
    if (key === prefilledFor.current) return
    prefilledFor.current = key
    if (operation?.message) setCommitMessage((m) => (m.trim() ? m : operation.message!))
  }, [operation])

  const wipConflictLabel = useMemo(() => {
    if (!operation || conflictCount === 0) return null
    const files = conflictCount === 1 ? 'A file conflict was' : `${conflictCount} file conflicts were`
    return operation.kind === 'rebase'
      ? `${files} found when attempting to rebase ${operation.rebaseBranch ?? 'HEAD'} onto ${operation.currentLabel}`
      : `${files} found when attempting to merge into ${operation.currentLabel}`
  }, [operation, conflictCount])

  const commitByHash = useMemo(() => new Map(graphCommits.map((c) => [c.hash, c])), [graphCommits])

  useEffect(() => {
    if (graphRows.length === 0 || selection.type === 'none') return
    if (selection.type === 'commits') {
      // Drop commits that went away (e.g. after a rebase).
      const kept = selection.hashes.filter((h) => commitByHash.has(h))
      if (kept.length !== selection.hashes.length) {
        setSelection(
          kept.length > 1
            ? { type: 'commits', hashes: kept, anchor: kept.includes(selection.anchor) ? selection.anchor : kept[0] }
            : kept.length === 1
              ? { type: 'commit', hash: kept[0] }
              : { type: 'none' }
        )
      }
      return
    }
    const selectedExists = selection.type === 'commit' && commitByHash.has(selection.hash)
    if (!hasWorkingChanges && (selection.type === 'working' || !selectedExists)) {
      setSelection({ type: 'commit', hash: graphRows[0].commit.hash })
    } else if (hasWorkingChanges && selection.type === 'commit' && !selectedExists) {
      setSelection({ type: 'working' })
    }
  }, [hasWorkingChanges, selection, graphRows, commitByHash])

  // ArrowUp/ArrowDown move the selection through the graph (WIP row first, then commits).
  useEffect(() => {
    if (fullScreenHash || showLaunchpad || showSettings || resolvingPath || rebaseBase) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const items: Selection[] = [
        ...(hasWorkingChanges ? [{ type: 'working' } as const] : []),
        ...graphRows.map((r) => ({ type: 'commit', hash: r.commit.hash }) as const)
      ]
      if (items.length === 0) return
      e.preventDefault()
      const focusedHash =
        selection.type === 'commit' ? selection.hash : selection.type === 'commits' ? selection.anchor : null
      const current = items.findIndex((item) =>
        item.type === 'commit' ? focusedHash === item.hash : selection.type === item.type
      )
      const next =
        current === -1
          ? 0
          : Math.min(items.length - 1, Math.max(0, current + (e.key === 'ArrowDown' ? 1 : -1)))
      setSelection(items[next])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fullScreenHash, showLaunchpad, showSettings, resolvingPath, rebaseBase, hasWorkingChanges, graphRows, selection])

  const handleOpenRepo = async (): Promise<void> => {
    const picked = await window.api.openRepoDialog()
    if (!picked) return
    const isRepo = await window.api.isGitRepo(picked)
    if (!isRepo) {
      const shouldInit = window.confirm(
        `"${picked}" is not a git repository yet. Initialize one here?`
      )
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
    setTabs((current) => {
      if (current.includes(path)) return current
      const at = repoPath ? current.indexOf(repoPath) : -1
      if (replace && at !== -1 && !pinnedTabs.includes(repoPath!)) {
        tabSnapshots.current.delete(repoPath!)
        return current.map((p, i) => (i === at ? path : p))
      }
      return [...current, path]
    })
    setRepoPath(path)
    setShowLaunchpad(false)
    setError(null)
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
    setEditingFiles((current) => Object.fromEntries(Object.entries(current).filter(([repo]) => !paths.includes(repo))))
    const remaining = tabs.filter((p) => !paths.includes(p))
    for (const path of paths) tabSnapshots.current.delete(path)
    setTabs(remaining)
    setPinnedTabs((current) => current.filter((p) => !paths.includes(p)))
    if (repoPath && paths.includes(repoPath)) {
      // Like a browser: the tab to the right takes over, else the one to the left.
      const index = tabs.indexOf(repoPath)
      const next = tabs.slice(index + 1).find((p) => !paths.includes(p)) ??
        [...tabs.slice(0, index)].reverse().find((p) => !paths.includes(p)) ??
        null
      if (next) handleOpenRecentRepo(next)
      else setRepoPath(null)
    }
  }

  // Pinned tabs sit together on the left, so pinning moves a tab to the end
  // of that group and unpinning to the start of the rest.
  const togglePinTab = (path: string): void => {
    const pinning = !pinnedTabs.includes(path)
    const nextPinned = pinning ? [...pinnedTabs, path] : pinnedTabs.filter((p) => p !== path)
    const pinnedInOrder = pinning ? nextPinned : tabs.filter((p) => nextPinned.includes(p))
    setPinnedTabs(pinnedInOrder)
    setTabs([...pinnedInOrder, ...(pinning ? [] : [path]), ...tabs.filter((p) => !nextPinned.includes(p) && p !== path)])
  }

  const moveTab = (path: string, before: string | null): void => {
    setTabs((current) => {
      const without = current.filter((p) => p !== path)
      if (before !== null) {
        without.splice(without.indexOf(before), 0, path)
        return without
      }
      // The end of the tab's own group.
      const lastPinned = without.reduce((last, p, i) => (pinnedTabs.includes(p) ? i : last), -1)
      without.splice(pinnedTabs.includes(path) ? lastPinned + 1 : without.length, 0, path)
      return without
    })
  }

  /** Ctrl+Tab and friends: the tab `offset` places along, wrapping around. */
  const cycleTab = (offset: number): void => {
    if (tabs.length === 0) return
    const index = repoPath ? tabs.indexOf(repoPath) : -1
    selectTab(tabs[(index + offset + tabs.length) % tabs.length])
  }

  const withBusy = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const handleStage = (paths: string[]): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.stage(repoPath, paths)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleUnstage = (paths: string[]): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.unstage(repoPath, paths)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleDiscard = (file: FileStatus): void => {
    if (!repoPath) return
    const ok = window.confirm(`Discard changes to "${file.path}"? This cannot be undone.`)
    if (!ok) return
    withBusy(async () => {
      const res = await window.api.discard(repoPath, file.path, file.untracked)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
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

  const handleFetch = (): void => {
    runFetch(false)
  }

  const handleUndo = (): void => {
    if (!repoPath || !undoLabel) return
    withBusy(async () => {
      const res = await window.api.undo(repoPath)
      if (!res.ok) showError(res.error)
      else setNotice(`${res.data}.`)
      await refresh(repoPath)
    })
  }

  const handleRedo = (): void => {
    if (!repoPath || !redoLabel) return
    withBusy(async () => {
      const res = await window.api.redo(repoPath)
      if (!res.ok) showError(res.error)
      else setNotice(`${res.data}.`)
      await refresh(repoPath)
    })
  }

  const handleCheckout = (branch: string): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.checkout(repoPath, branch)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

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
    setRunCommand(next)
    return next
  }

  // The commit Run acts on: the selected one, if just one is selected. A
  // clean HEAD is just the working tree, so that runs in the repo.
  const runCommit =
    selection.type === 'commit' && !(selection.hash === headHash && !hasWorkingChanges) ? selection.hash : null
  const runIsolated = !!runCommit && runMode === 'isolated'
  const runRunning = !!repoPath && runningKeys.includes(runKey(repoPath, runIsolated))

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
    const repo = repoPath
    const command = (await window.api.getRunCommand(repo)).command ?? (await editRunCommand())
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
        const res = await window.api.checkout(repo, commit)
        if (!res.ok) showError(res.error)
        else checkedOut = true
        await refresh(repo)
      })
      if (!checkedOut) return
    }
    setPreparingRun(true)
    setError(null)
    try {
      const res = await window.api.planRun(repo, isolated ? commit : null)
      if (!res.ok) {
        showError(res.error)
        return
      }
      const name = repoDisplayName(repo)
      terminalRef.current?.startRun({
        key: runKey(repo, isolated),
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

  useEffect(() => {
    setRunCommand(null)
    if (!repoPath) return
    let current = true
    window.api.getRunCommand(repoPath).then(({ command }) => {
      if (current) setRunCommand(command)
    })
    return () => {
      current = false
    }
  }, [repoPath])

  const handleCreateBranch = (branch: string): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.createBranch(repoPath, branch)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handlePush = (): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.push(repoPath)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  /**
   * Runs a git command that may stop on conflicts. When it does, the working
   * changes open so the conflicted files are in view.
   */
  const runConflictable = (
    run: (path: string) => Promise<{ ok: true; data: ConflictableResult } | { ok: false; error: string }>
  ): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await run(repoPath)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
      // After the refresh, so the WIP row exists to select.
      if (res.ok && res.data.conflicts) {
        setFullScreenHash(null)
        setFileView(null)
        setSelection({ type: 'working' })
      }
    })
  }

  /** Pulls the remembered way, or `mode`, which then becomes what Pull does. */
  const handlePull = (mode?: PullMode): void => {
    if (mode) {
      setPullMode(mode)
      savePullMode(mode)
    }
    runConflictable((path) => window.api.pull(path, mode ?? pullMode))
  }

  const promptCreateBranch = async (): Promise<void> => {
    const name = await askText({ title: 'Create branch', label: 'Branch name', submitLabel: 'Create branch' })
    if (name) handleCreateBranch(name)
  }

  const handleApplyPatch = (): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.applyPatch(repoPath)
      if (!res.ok) showError(res.error)
      else if (res.data) {
        setNotice(
          res.data.conflicts
            ? `${res.data.file} applied with conflicts. Resolve them in the changed files.`
            : `Applied ${res.data.file}. Its changes are staged.`
        )
        setFullScreenHash(null)
        setFileView(null)
        setShowLaunchpad(false)
        setSelection({ type: 'working' })
      }
      await refresh(repoPath)
    })
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
    setError(null)
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

  const handleMerge = (branch: string): void => runConflictable((path) => window.api.mergeBranch(path, branch))

  const handleRebase = (branch: string): void => runConflictable((path) => window.api.rebaseOnto(path, branch))

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
    withBusy(async () => {
      const res = await window.api.abortOperation(repoPath)
      if (!res.ok) showError(res.error)
      else {
        setCommitMessage('')
        setResolvingPath(null)
      }
      await refresh(repoPath)
    })
  }

  const fileCount = (n: number): string => (n === 1 ? '1 file' : `${n} files`)

  const handleTakeSide = (paths: string[], side: 'current' | 'incoming'): void => {
    if (!repoPath) return
    withBusy(async () => {
      // All or nothing, and undoable: taking a side overwrites the working file.
      const res = await window.api.takeSideMany(repoPath, paths, side)
      if (!res.ok) showError(res.error)
      else {
        const label = side === 'current' ? operation?.currentLabel ?? 'current' : operation?.incomingLabel ?? 'incoming'
        setConflictUndo({ repoPath, snapshot: res.data, message: `Took ${side} (${label}) for ${fileCount(paths.length)}.` })
        if (resolvingPath && paths.includes(resolvingPath)) setResolvingPath(null)
      }
      await refresh(repoPath)
    })
  }

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
    const repo = repoPath
    setNotice(`Opened ${path} in ${externalToolName}. Save and close it there to finish.`)
    const res = await window.api.openInMergeTool(repo, path)
    if (!res.ok) {
      setNotice(null)
      showError(res.error)
    } else if (res.data.resolved) {
      setNotice(`Resolved ${path} in ${externalToolName}.`)
      setResolvingPath((p) => (p === path ? null : p))
    } else {
      setNotice(res.data.reason ?? `${path} is still conflicted.`)
    }
    await refresh(repo)
  }

  const handleStash = (): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.stash(repoPath)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleStashWithMessage = async (): Promise<void> => {
    if (!repoPath) return
    const message = await askText({ title: 'Stash changes', label: 'Stash message', submitLabel: 'Stash' })
    if (message === null) return
    withBusy(async () => {
      const res = await window.api.stash(repoPath, message.trim() || undefined)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const stashActions = {
    apply: (stash: StashEntry): void => {
      if (!repoPath) return
      withBusy(async () => {
        const res = await window.api.stashApply(repoPath, stash.ref)
        if (!res.ok) showError(res.error)
        await refresh(repoPath)
      })
    },
    pop: (stash: StashEntry): void => {
      if (!repoPath) return
      withBusy(async () => {
        const res = await window.api.stashPop(repoPath, stash.ref)
        if (!res.ok) showError(res.error)
        await refresh(repoPath)
      })
    },
    drop: (stash: StashEntry): void => {
      if (!repoPath) return
      if (!window.confirm(`Delete the stash "${stash.message}"? It can't be brought back from SillyGit.`)) return
      withBusy(async () => {
        const res = await window.api.stashDrop(repoPath, stash.ref)
        if (!res.ok) showError(res.error)
        await refresh(repoPath)
      })
    }
  }

  const handleStashPop = (): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.stashPop(repoPath)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleCherryPick = (hash: string | string[]): void =>
    runConflictable((path) => window.api.cherryPick(path, hash))

  const handleRevertCommit = (hash: string | string[]): void =>
    runConflictable((path) => window.api.revertCommit(path, hash))

  // The loaded commits HEAD can reach: the ones an interactive rebase can start from.
  const headAncestors = useMemo(() => {
    const parents = new Map(graphRows.map((r) => [r.commit.hash, r.commit.parents]))
    const seen = new Set<string>()
    const queue = headHash ? [headHash] : []
    while (queue.length > 0) {
      const hash = queue.pop()!
      if (seen.has(hash) || !parents.has(hash)) continue
      seen.add(hash)
      queue.push(...parents.get(hash)!)
    }
    return seen
  }, [graphRows, headHash])

  const handleInteractiveRebase = (base: string): void => {
    if (!repoPath) return
    setFullScreenHash(null)
    setResolvingPath(null)
    closeEditor()
    setFileView(null)
    setRebaseEditor({ repoPath, base })
  }

  /** Runs the planned rebase; resolves to false when it didn't start, so the editor stays open. */
  const handleStartRebase = async (plan: RebasePlan, steps: RebaseStep[]): Promise<boolean> => {
    if (!repoPath) return false
    setBusy(true)
    setError(null)
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

  // --- Drag and drop on the graph and sidebar --------------------------------
  const [dropMenu, setDropMenu] = useState<{
    x: number
    y: number
    source: DragSource
    target: string
    options: DropOption[]
  } | null>(null)

  const handleDrop = async (source: DragSource, target: string, x: number, y: number): Promise<void> => {
    if (!repoPath) return
    // For several commits, the newest decides whether the branch already has them.
    const from = source.kind === 'branch' ? source.name : source.hashes[source.hashes.length - 1]
    const res = await window.api.dropRelation(repoPath, from, target)
    if (!res.ok) {
      showError(res.error)
      return
    }
    setDropMenu({ x, y, source, target, options: dropOptions(source, target, res.data, shortRef) })
  }

  const runDropAction = (source: DragSource, target: string, option: DropOption): void => {
    if (source.kind === 'commits') {
      runConflictable((path) => window.api.cherryPickOnto(path, source.hashes, target))
    } else if (option.action === 'merge') {
      runConflictable((path) => window.api.mergeInto(path, source.name, target))
    } else if (option.action === 'rebase') {
      runConflictable((path) => window.api.rebaseBranchOnto(path, source.name, target))
    } else if (option.action === 'fast-forward' && repoPath) {
      withBusy(async () => {
        const res = await window.api.fastForward(repoPath, target, source.name)
        if (!res.ok) showError(res.error)
        await refresh(repoPath)
      })
    }
  }

  const graphOrder = useMemo(() => graphRows.map((r) => r.commit.hash), [graphRows])

  const handleClickCommit = (hash: string, modifiers: ClickModifiers): void =>
    setSelection((current) => clickCommit(current, hash, modifiers, graphOrder))

  /** Selects one commit, loading more of the graph first when it's further down than what's loaded. */
  const jumpToCommit = async (hit: CommitSearchHit): Promise<void> => {
    if (!commitByHash.has(hit.hash)) {
      if (hit.index >= graphLimitRef.current) {
        await loadGraph(Math.ceil((hit.index + 1) / GRAPH_PAGE) * GRAPH_PAGE + GRAPH_PAGE)
      }
    }
    setFullScreenHash(null)
    setFileView(null)
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

  const handleResetTo = (hash: string, mode: 'soft' | 'mixed' | 'hard'): void => {
    if (!repoPath) return
    if (mode === 'hard') {
      const ok = window.confirm(
        'Hard reset will discard all uncommitted changes and move the branch pointer. This cannot be undone easily. Continue?'
      )
      if (!ok) return
    }
    withBusy(async () => {
      const res = await window.api.resetTo(repoPath, hash, mode)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleCreateBranchAt = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const name = await askText({ title: 'Create branch here', label: 'Branch name', submitLabel: 'Create branch' })
    if (!name) return
    withBusy(async () => {
      const res = await window.api.createBranchAt(repoPath, name, hash)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleCreateTag = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const name = await askText({ title: 'Create tag here', label: 'Tag name', submitLabel: 'Create tag' })
    if (!name) return
    withBusy(async () => {
      const res = await window.api.createTag(repoPath, name, hash)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
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
    if (message === null) return
    withBusy(async () => {
      const res = await window.api.createAnnotatedTag(repoPath, name, message, hash)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
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

  const handleCheckoutRemote = (name: string): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.checkoutRemoteBranch(repoPath, name)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleCreateWorktree = (ref: string, kind: 'local' | 'remote' | 'commit'): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.addWorktree(repoPath, ref, kind)
      if (!res.ok) showError(res.error)
      else if (res.data) setNotice(`Created a worktree at ${res.data}`)
      await refresh(repoPath)
    })
  }

  const handleDeleteBranch = (target: RefTarget): void => {
    if (!repoPath) return
    if (target.remote) {
      const ok = window.confirm(`Delete ${target.name} from the remote? Anyone else using it will lose it too.`)
      if (!ok) return
      withBusy(async () => {
        const res = await window.api.deleteRemoteBranch(repoPath, target.name)
        if (!res.ok) showError(res.error)
        await refresh(repoPath)
      })
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
    if (!next || next === name) return
    withBusy(async () => {
      const res = await window.api.renameBranch(repoPath, name, next)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const refActions: RefActions = {
    checkout: handleCheckout,
    checkoutRemote: handleCheckoutRemote,
    merge: handleMerge,
    rebase: handleRebase,
    createWorktree: handleCreateWorktree,
    createBranchAt: handleCreateBranchAt,
    cherryPick: handleCherryPick,
    interactiveRebase: handleInteractiveRebase,
    canInteractiveRebase: (hash) => !!status?.branch && hash !== headHash && headAncestors.has(hash),
    resetTo: handleResetTo,
    revertCommit: handleRevertCommit,
    deleteBranch: handleDeleteBranch,
    renameBranch: handleRenameBranch,
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
    revalidate: revalidatePullRequests
  }

  const multiActions = {
    cherryPick: (hashes: string[]) => handleCherryPick(hashes),
    revert: (hashes: string[]) => handleRevertCommit(hashes),
    copyText: handleCopyText,
    select: (hash: string) => setSelection({ type: 'commit', hash })
  }

  /** Shows a file's history or blame in place of the graph; a null `ref` starts from the working tree. */
  const openFileView = (path: string, ref: string | null, mode: FileViewMode): void => {
    setShowLaunchpad(false)
    setRebaseEditor(null)
    setFileView({ path, ref, mode })
  }

  const showCommitInGraph = (hash: string): void => {
    setFileView(null)
    setFullScreenHash(null)
    closeEditor()
    void handleSelectBranchCommit(hash)
  }

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

  const focusSearch = (): void => {
    setFullScreenHash(null)
    setFileView(null)
    setShowLaunchpad(false)
    setResolvingPath(null)
    setSearchFocusToken((n) => n + 1)
  }

  const startAmend = (): void => {
    setFullScreenHash(null)
    setFileView(null)
    setShowLaunchpad(false)
    setSelection({ type: 'working' })
    handleAmendChange(true)
  }

  /**
   * Everything the Actions list and command palette offer, alphabetically
   * like GitKraken's. Actions that need a branch or stash open a sub-list.
   */
  const paletteCommands = (): Command[] => {
    const commands: Command[] = []
    const add = (id: string, label: string, run: () => void, shortcut?: string): void => {
      commands.push({ id, label, run, shortcut })
    }
    const addList = (id: string, label: string, children: Command[]): void => {
      if (children.length > 0) commands.push({ id, label, children })
    }
    const localOthers = branches.filter((b) => !b.current && !b.remote)
    const current = status?.branch ?? 'HEAD'
    if (repoPath) {
      if (undoLabel) add('undo', undoLabel, handleUndo, `${MOD}Z`)
      if (redoLabel) add('redo', redoLabel, handleRedo, `${MOD}⇧Z`)
      if (remotes.length > 0) {
        add('fetch', 'Fetch all remotes', handleFetch)
        add('pull', 'Pull (fast-forward if possible)', () => handlePull('ff'))
        add('pull-ff-only', 'Pull (fast-forward only)', () => handlePull('ff-only'))
        add('pull-rebase', 'Pull (rebase)', () => handlePull('rebase'))
        add('push', 'Push', handlePush)
      }
      add('search', 'Search commits', focusSearch, `${MOD}F`)
      add('commit', 'Go to uncommitted changes', () => {
        setFullScreenHash(null)
        setFileView(null)
        setShowLaunchpad(false)
        setSelection({ type: 'working' })
      })
      add('amend', 'Amend last commit', startAmend)
      add('run', 'Run', () => void handleRun())
      if (runCommit) {
        add('run-isolated', 'Run selected commit in isolation', () => void handleRun('isolated'))
        add('run-checkout', 'Check out selected commit and run', () => void handleRun('checkout'))
      }
      add('run-command', 'Edit run command…', () => void editRunCommand())
      addList(
        'blame',
        'Blame file',
        trackedFiles.map((path) => ({ id: path, label: path, run: () => openFileView(path, null, 'blame') }))
      )
      addList(
        'file-history',
        'File history',
        trackedFiles.map((path) => ({ id: path, label: path, run: () => openFileView(path, null, 'history') }))
      )
      add('apply-patch', 'Apply patch…', handleApplyPatch)
      if (hasWorkingChanges && !operation) {
        add('stash', 'Stash changes', handleStash)
        add('stash-message', 'Stash changes with a message…', handleStashWithMessage)
      }
      addList(
        'stash-apply',
        'Apply stash',
        stashes.map((stash) => ({ id: stash.ref, label: `${stash.ref}: ${stash.message}`, run: () => stashActions.apply(stash) }))
      )
      addList(
        'stash-pop',
        'Pop stash',
        stashes.map((stash) => ({ id: stash.ref, label: `${stash.ref}: ${stash.message}`, run: () => stashActions.pop(stash) }))
      )
      add('new-branch', 'Create branch…', promptCreateBranch)
      const checkouts: Command[] = []
      for (const b of branches) {
        if (b.current) continue
        if (b.remote) {
          if (branches.some((l) => !l.remote && l.upstream === b.name)) continue
          checkouts.push({ id: b.name, label: `Check out ${b.name}`, run: () => handleCheckoutRemote(b.name) })
        } else {
          checkouts.push({ id: b.name, label: `Check out ${b.name}`, run: () => handleCheckout(b.name) })
        }
      }
      addList('checkout', 'Checkout', checkouts)
      addList(
        'merge',
        `Merge into ${current}`,
        localOthers.map((b) => ({ id: b.name, label: `Merge ${b.name} into ${current}`, run: () => handleMerge(b.name) }))
      )
      addList(
        'rebase',
        `Rebase ${current} onto`,
        localOthers.map((b) => ({ id: b.name, label: `Rebase ${current} onto ${b.name}`, run: () => handleRebase(b.name) }))
      )
      addList(
        'delete-branch',
        'Delete branch',
        localOthers.map((b) => ({
          id: b.name,
          label: `Delete ${b.name}`,
          run: () => handleDeleteBranch({ name: b.name, remote: false, current: false })
        }))
      )
      if (status?.branch) add('rename-branch', `Rename ${status.branch}…`, () => handleRenameBranch(status.branch!))
      if (operation) {
        add('continue', `Continue ${operation.kind}`, handleContinue)
        add('abort', `Abort ${operation.kind}`, handleAbort)
      }
      add('close-tab', 'Close tab', () => closeTabs([repoPath]))
      add('pin-tab', pinnedTabs.includes(repoPath) ? 'Unpin tab' : 'Pin tab', () => togglePinTab(repoPath))
      add('claude', showClaude ? 'Hide Claude' : 'Show Claude', () => setShowClaude((v) => !v), 'Ctrl+Esc')
      add('reveal', 'Open repository folder', () => {
        window.api.openPath(repoPath).then((res) => {
          if (!res.ok) showError(res.error)
        })
      })
      add('copy-path', 'Copy repository path', () => handleCopyText(repoPath))
    }
    add('activity', 'Activity log', () => setShowActivity(true))
    add('launchpad', showLaunchpad ? 'Close Launchpad' : 'Open Launchpad', () => setShowLaunchpad((v) => !v))
    if (tabs.length > 1) {
      add('next-tab', 'Next tab', () => cycleTab(1), 'Ctrl+Tab')
      add('previous-tab', 'Previous tab', () => cycleTab(-1), 'Ctrl+⇧Tab')
    }
    add('clone', 'Clone repository…', handleClone)
    add('terminal', showTerminal ? 'Hide terminal' : 'Show terminal', () => setShowTerminal((v) => !v), 'Ctrl+`')
    add('open-repo', 'Open repository…', handleOpenRepo, `${MOD}O`)
    addList(
      'recent',
      'Open recent repository',
      recentRepos
        .filter((path) => path !== repoPath)
        .map((path) => ({ id: path, label: repoDisplayName(path), run: () => handleOpenRecentRepo(path) }))
    )
    add('settings', 'Settings', () => setShowSettings(true), `${MOD},`)
    return commands.sort((a, b) => a.label.localeCompare(b.label))
  }

  // App-wide shortcuts. A ref keeps the listener's view of state current
  // without re-registering it on every render.
  const shortcutHandlers = useRef<(e: KeyboardEvent) => void>(() => {})
  shortcutHandlers.current = (e: KeyboardEvent): void => {
    if (prompt || showSettings || showActivity) return
    const key = e.key.toLowerCase()
    if ((isPrimary(e) && key === 'k') || (isPrimary(e, true) && key === 'p')) {
      e.preventDefault()
      setPalette((v) => (v ? null : 'modal'))
      return
    }
    if (showPalette) return
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
      cycleTab(e.shiftKey ? -1 : 1)
    } else if (isPrimary(e, true) && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault()
      cycleTab(e.code === 'BracketLeft' ? -1 : 1)
    } else if (isPrimary(e) && /^Digit[1-9]$/.test(e.code) && tabs.length > 0) {
      // Like a browser: Cmd+1 to Cmd+8 pick that tab, Cmd+9 the last one.
      e.preventDefault()
      const n = Number(e.code.slice(5))
      const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]
      if (target) selectTab(target)
    } else if (isPrimary(e) && key === ',') {
      e.preventDefault()
      setShowSettings(true)
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => shortcutHandlers.current(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const editingPath = repoPath ? editingFiles[repoPath] : undefined
  const openEditor = (path: string): void => {
    if (repoPath) setEditingFiles((current) => ({ ...current, [repoPath]: path }))
  }
  const closeEditor = (): void => {
    if (!repoPath) return
    setEditingFiles(({ [repoPath]: _closed, ...rest }) => rest)
  }
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
          onOpenCommitFileDiff={(hash, path) => {
            closeEditor()
            setFullScreenHash(hash)
            setFullScreenPath(path)
          }}
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
        onMove={moveTab}
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
        fetching={fetching}
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
      />
      {error && (
        <div className="error-banner" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      {conflictUndo && conflictUndo.repoPath === repoPath && (
        <div className="notice-banner conflict-undo-banner" role="status" aria-label="Undo conflict action">
          {conflictUndo.message}
          <button className="link-button" onClick={handleUndoConflictAction}>
            Undo
          </button>
          <button className="icon-button" title="Dismiss" onClick={() => setConflictUndo(null)}>
            ✕
          </button>
        </div>
      )}
      <div className="workspace-row">
        <div className="workspace">
          <div className="workspace-main">
            {showLaunchpad ? (
              <Launchpad
                repoPath={repoPath}
                openRepos={tabs}
                onClose={() => setShowLaunchpad(false)}
                onOpenTerminal={() => setShowTerminal(true)}
              />
            ) : !repoPath ? (
              <div className="empty-state">
                <img className="empty-state-logo" src={logo} alt="SillyGit" />
                <p>No repository open.</p>
                <button onClick={handleOpenRepo}>Open Repository</button>
                {recentRepos.length > 0 && (
                  <section className="recent-repos" aria-label="Recent repositories">
                    <span className="recent-repos-label">Recent</span>
                    {recentRepos.map((path) => (
                      <button
                        key={path}
                        className="recent-repo"
                        title={path}
                        onClick={() => handleOpenRecentRepo(path)}
                      >
                        <span className="recent-repo-name">{repoDisplayName(path)}</span>
                        <span className="recent-repo-path">{path}</span>
                      </button>
                    ))}
                  </section>
                )}
              </div>
            ) : resolvingPath ? (
              <MergeResolver
                key={resolvingPath}
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
            ) : rebaseBase ? (
              <InteractiveRebase
                key={rebaseBase}
                repoPath={repoPath}
                base={rebaseBase}
                onClose={() => setRebaseEditor(null)}
                onStart={handleStartRebase}
              />
            ) : fileView ? (
              <div className="main-layout">
                <FileHistoryView
                  repoPath={repoPath}
                  target={fileView}
                  onClose={() => setFileView(null)}
                  onOpenCommit={(hash, path) => {
                    setFileView(null)
                    closeEditor()
                    setFullScreenHash(hash)
                    setFullScreenPath(path)
                    setSelection({ type: 'commit', hash })
                  }}
                  onShowInGraph={showCommitInGraph}
                  onCopyText={handleCopyText}
                  onEditFile={(path) => {
                    setFileView(null)
                    openEditor(path)
                  }}
                  onWorkingTreeChanged={() => refresh(repoPath)}
                />
              </div>
            ) : editingPath ? (
              <div className="main-layout">
                <Suspense fallback={<div className="file-editor" />}>
                  <FileEditor
                    key={`${repoPath}\0${editingPath}`}
                    repoPath={repoPath}
                    path={editingPath}
                    draft={editorDrafts.current.get(`${repoPath}\0${editingPath}`)}
                    onDraftChange={(draft) => {
                      const key = `${repoPath}\0${editingPath}`
                      if (draft == null) editorDrafts.current.delete(key)
                      else editorDrafts.current.set(key, draft)
                    }}
                    onClose={closeEditor}
                    onSaved={() => refresh(repoPath)}
                    onOpenFileView={(path, mode) => openFileView(path, null, mode)}
                  />
                </Suspense>
                {detailPanel}
              </div>
            ) : fullScreenHash ? (
              <CommitFullView
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
            ) : (
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
                    setSelection(
                      selection.type === 'working' ? { type: 'none' } : { type: 'working' }
                    )
                  }
                  onClickCommit={handleClickCommit}
                  onJumpToCommit={jumpToCommit}
                  onCheckout={handleCheckout}
                  actions={refActions}
                  hasMore={hasMoreCommits}
                  loadingMore={loadingMore}
                  onLoadMore={handleLoadMore}
                  searchFocusToken={searchFocusToken}
                  refColumnWidth={refColumnWidth}
                  sprints={sprintSettings}
                  onRefColumnWidthChange={setRefColumnWidth}
                />
                {detailPanel}
              </div>
            )}
          </div>
          <TerminalPanel
            ref={terminalRef}
            onRunningChange={setRunningKeys}
            cwd={repoPath}
            visible={showTerminal}
            height={terminalHeight}
            onToggle={() => setShowTerminal(false)}
            onHeightChange={setTerminalHeight}
          />
        </div>
        {repoPath && (
          <ClaudePanel
            key={repoPath}
            repoPath={repoPath}
            visible={showClaude}
            width={claudeWidth}
            onWidthChange={setClaudeWidth}
            onClose={() => setShowClaude(false)}
            onFilesChanged={handleClaudeFilesChanged}
          />
        )}
      </div>
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          autoFetchMinutes={autoFetchMinutes ?? 0}
          onAutoFetchChange={handleAutoFetchChange}
          sprints={sprintSettings}
          onSprintsChange={handleSprintSettingsChange}
          mergeTool={mergeToolSettings}
          onMergeToolChange={handleMergeToolChange}
        />
      )}
      {palette && <CommandPalette commands={paletteCommands()} variant={palette} onClose={() => setPalette(null)} />}
      {showActivity && <ActivityLog repoPath={repoPath} onClose={() => setShowActivity(false)} />}
      {prompt && (
        <PromptDialog
          key={prompt.title}
          {...prompt}
          onSubmit={(value) => {
            setPrompt(null)
            prompt.resolve(value)
          }}
          onCancel={() => {
            setPrompt(null)
            prompt.resolve(null)
          }}
        />
      )}
      <RefDragLayer onDrop={handleDrop} />
      {dropMenu && (
        <ContextMenu
          x={dropMenu.x}
          y={dropMenu.y}
          sections={[
            dropMenu.options.map((option) => ({
              id: option.action,
              label: option.label,
              title: option.title,
              disabled: option.disabled,
              onSelect: () => runDropAction(dropMenu.source, dropMenu.target, option)
            }))
          ]}
          onClose={() => setDropMenu(null)}
        />
      )}
    </div>
  )
}
