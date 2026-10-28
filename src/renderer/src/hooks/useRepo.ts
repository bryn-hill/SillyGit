import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BranchInfo, GraphCommit, OperationState, RepoRemote, RepoStatus, StashEntry } from '../../../shared/types'
import { layoutGraph } from '../lib/graphLayout'
import type { Selection } from '../lib/selection'

// Commits loaded per page; the graph loads another page as you scroll near the end.
export const GRAPH_PAGE = 500

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

/**
 * The repo showing (the active tab) and everything read from it: status,
 * branches, the graph, any merge or rebase in progress, remotes, stashes and
 * undo. It refreshes when the repo changes on disk or the window is focused,
 * and fetches in the background every `autoFetchMinutes` (0 or null = off).
 *
 * `onError` must be stable (a state setter), since refresh depends on it.
 */
export function useRepo({
  onError,
  autoFetchMinutes
}: {
  onError: (message: string) => void
  autoFetchMinutes: number | null
}) {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  // When the branches were last listed, to age them against (stale tags) without reading the clock while rendering.
  const [branchesListedAt, setBranchesListedAt] = useState(() => Date.now())
  const [remotes, setRemotes] = useState<RepoRemote[]>([])
  const [graphCommits, setGraphCommits] = useState<GraphCommit[]>([])
  const [operation, setOperation] = useState<OperationState | null>(null)
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [undoLabel, setUndoLabel] = useState<string | null>(null)
  const [redoLabel, setRedoLabel] = useState<string | null>(null)
  const [graphLimit, setGraphLimit] = useState(GRAPH_PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetching, setFetching] = useState(false)

  // Refreshes can overlap (a watcher event during a commit, say); only the
  // newest one's answers are applied, and never one for a repo that's closed.
  const graphLimitRef = useRef(GRAPH_PAGE)
  const refreshSeq = useRef(0)
  // The repo showing, for async work to check it's still wanted; show() keeps it current.
  const openRepo = useRef<string | null>(null)
  const tabSnapshots = useRef(new Map<string, TabSnapshot>())

  const refresh = useCallback(
    async (path: string) => {
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
      else onError(statusRes.error)
      setOperation(operationRes.ok ? operationRes.data : null)
      if (branchesRes.ok) {
        setBranches(branchesRes.data)
        setBranchesListedAt(Date.now())
      }
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
    },
    [onError]
  )

  /**
   * Shows a different repo (tab): puts up what it showed last time, or
   * nothing, so another repo's commits never show under its name, then
   * refreshes it. Returns the selection it had last time, if any.
   */
  const show = (path: string | null): Selection | undefined => {
    openRepo.current = path
    setRepoPath(path)
    graphLimitRef.current = GRAPH_PAGE
    setGraphLimit(GRAPH_PAGE)
    const snapshot = path ? tabSnapshots.current.get(path) : undefined
    setStatus(snapshot?.status ?? null)
    setBranches(snapshot?.branches ?? [])
    setGraphCommits(snapshot?.graphCommits ?? [])
    setOperation(snapshot?.operation ?? null)
    setRemotes(snapshot?.remotes ?? [])
    setStashes(snapshot?.stashes ?? [])
    setUndoLabel(snapshot?.undoLabel ?? null)
    setRedoLabel(snapshot?.redoLabel ?? null)
    return snapshot?.selection
  }

  /** Drops what a closed (or replaced) tab showed. */
  const forget = (path: string): void => {
    tabSnapshots.current.delete(path)
  }

  /** Remembers the showing repo's selection for when its tab is switched back to. */
  const rememberSelection = useCallback(
    (selection: Selection) => {
      const snapshot = repoPath ? tabSnapshots.current.get(repoPath) : undefined
      if (snapshot) snapshot.selection = selection
    },
    [repoPath]
  )

  useEffect(() => {
    if (repoPath) refresh(repoPath)
  }, [repoPath, refresh])

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

  const loadMore = useCallback(() => {
    loadGraph(graphLimitRef.current + GRAPH_PAGE)
  }, [loadGraph])

  /** Loads enough of the graph to include the commit `index` places down, when it isn't loaded yet. */
  const loadThrough = async (index: number): Promise<void> => {
    if (index >= graphLimitRef.current) await loadGraph(Math.ceil((index + 1) / GRAPH_PAGE) * GRAPH_PAGE + GRAPH_PAGE)
  }

  const fetchRemotes = useCallback(
    async (quiet: boolean): Promise<void> => {
      if (!repoPath) return
      setFetching(true)
      const res = await window.api.fetch(repoPath)
      setFetching(false)
      if (!res.ok && !quiet) onError(res.error)
      if (openRepo.current === repoPath) await refresh(repoPath)
    },
    [repoPath, refresh, onError]
  )

  // Fetch quietly when a repo opens and every few minutes after (see
  // Settings), so ahead and behind counts and remote branches stay current.
  // Failures (offline, no credentials) are ignored here; the Fetch button
  // reports them.
  useEffect(() => {
    if (!repoPath || !autoFetchMinutes) return
    const first = setTimeout(() => fetchRemotes(true), 3000)
    const timer = setInterval(() => fetchRemotes(true), autoFetchMinutes * 60 * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [repoPath, fetchRemotes, autoFetchMinutes])

  // Claude's edits and commands land in bursts; refresh once they settle.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshSoon = useCallback(() => {
    if (!repoPath) return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => refresh(repoPath), 400)
  }, [repoPath, refresh])

  const graphRows = useMemo(() => layoutGraph(graphCommits), [graphCommits])
  const graphOrder = useMemo(() => graphRows.map((r) => r.commit.hash), [graphRows])
  const commitByHash = useMemo(() => new Map(graphCommits.map((c) => [c.hash, c])), [graphCommits])
  const headHash = useMemo(
    () => graphCommits.find((c) => c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD ->')))?.hash ?? null,
    [graphCommits]
  )

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

  return {
    repoPath,
    status,
    branches,
    branchesListedAt,
    remotes,
    operation,
    stashes,
    undoLabel,
    redoLabel,
    graphRows,
    graphOrder,
    commitByHash,
    headHash,
    headAncestors,
    hasMore: graphCommits.length >= graphLimit,
    loadingMore,
    fetching,
    refresh,
    refreshSoon,
    show,
    forget,
    rememberSelection,
    loadMore,
    loadThrough,
    fetchRemotes
  }
}

export type Repo = ReturnType<typeof useRepo>
