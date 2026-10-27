import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
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
  StashEntry
} from '../../shared/types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import CommitGraph from './components/CommitGraph'
import DetailPanel from './components/DetailPanel'
import CommitFullView from './components/CommitFullView'
import MergeResolver from './components/MergeResolver'
import Launchpad from './components/Launchpad'
import SettingsModal from './components/SettingsModal'
import PromptDialog, { type PromptRequest } from './components/PromptDialog'
import TerminalPanel, { DEFAULT_HEIGHT as DEFAULT_TERMINAL_HEIGHT } from './components/TerminalPanel'
import ClaudePanel, { DEFAULT_CLAUDE_WIDTH } from './components/claude/ClaudePanel'
import { layoutGraph } from './lib/graphLayout'
import { repoDisplayName } from './lib/repoName'
import { resolveBranchRemote } from '../../shared/branchRemote'
import type { RefActions, RefTarget } from './components/RefContextMenu'
import { withPullRequestText } from '../../shared/quickActions'
import CommandPalette, { type Command } from './components/CommandPalette'
import type { ClickModifiers } from './components/CommitGraph'
import { clickCommit } from './lib/selection'
import { isPrimary, isTyping, MOD } from './lib/shortcuts'

// Commits loaded per page; the graph loads another page as you scroll near the end.
const GRAPH_PAGE = 500

// 'none' means nothing is selected and the side bar is closed. 'commits' is a
// multi-selection (newest first); `anchor` is where a Shift-click range starts.
export type Selection =
  | { type: 'none' }
  | { type: 'working' }
  | { type: 'commit'; hash: string }
  | { type: 'commits'; hashes: string[]; anchor: string }

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
  const [operation, setOperation] = useState<OperationState | null>(null)
  const [resolvingPath, setResolvingPath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fullScreenHash, setFullScreenHash] = useState<string | null>(null)
  const [fullScreenPath, setFullScreenPath] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [prompt, setPrompt] = useState<(PromptRequest & { resolve: (value: string | null) => void }) | null>(null)
  const [showLaunchpad, setShowLaunchpad] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const [showClaude, setShowClaude] = useState(false)
  const [claudeWidth, setClaudeWidth] = useState(DEFAULT_CLAUDE_WIDTH)
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [graphLimit, setGraphLimit] = useState(GRAPH_PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [undoLabel, setUndoLabel] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [amend, setAmend] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
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

  // Reopen whatever was open when the app last quit.
  useEffect(() => {
    window.api.getSession().then((session) => {
      const { layout } = session
      if (layout.showTerminal !== undefined) setShowTerminal(layout.showTerminal)
      if (layout.terminalHeight) setTerminalHeight(layout.terminalHeight)
      if (layout.showClaude !== undefined) setShowClaude(layout.showClaude)
      if (layout.claudeWidth) setClaudeWidth(layout.claudeWidth)
      setRecentRepos(session.recentRepos)
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
      window.api.saveLayout({ showTerminal, terminalHeight, showClaude, claudeWidth })
    }, 300)
    return () => clearTimeout(timer)
  }, [sessionRestored, showTerminal, terminalHeight, showClaude, claudeWidth])

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

  const refresh = useCallback(async (path: string) => {
    const seq = ++refreshSeq.current
    const [statusRes, branchesRes, graphRes, operationRes, remotesRes, stashesRes, undoRes] = await Promise.all([
      window.api.getStatus(path),
      window.api.branches(path),
      window.api.graphLog(path, graphLimitRef.current),
      window.api.operationState(path),
      window.api.remotes(path),
      window.api.stashes(path),
      window.api.undoLabel(path)
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
  }, [])

  useEffect(() => {
    graphLimitRef.current = GRAPH_PAGE
    setGraphLimit(GRAPH_PAGE)
    setAmend(false)
    if (repoPath) refresh(repoPath)
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
    if (fullScreenHash || showLaunchpad || showSettings || resolvingPath) return
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
  }, [fullScreenHash, showLaunchpad, showSettings, resolvingPath, hasWorkingChanges, graphRows, selection])

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

  const switchToRepo = async (path: string): Promise<void> => {
    setRepoPath(path)
    setResolvingPath(null)
    setSelection({ type: 'working' })
    setError(null)
    setNotice(null)
    const res = await window.api.recordOpenedRepo(path)
    if (res.ok) setRecentRepos(res.data)
  }

  const handleOpenRecentRepo = async (path: string): Promise<void> => {
    if (path === repoPath) return
    if (!(await window.api.isGitRepo(path))) {
      showError(`${path} is gone or is no longer a git repository, so it was removed from recent repositories.`)
      const res = await window.api.forgetRecentRepo(path)
      if (res.ok) setRecentRepos(res.data)
      return
    }
    await switchToRepo(path)
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

  const handleCheckout = (branch: string): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.checkout(repoPath, branch)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

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
        setSelection({ type: 'working' })
      }
    })
  }

  const handlePull = (): void => runConflictable((path) => window.api.pull(path))

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

  const handleTakeSide = (paths: string[], side: 'current' | 'incoming'): void => {
    if (!repoPath) return
    withBusy(async () => {
      for (const path of paths) {
        const res = await window.api.takeSide(repoPath, path, side)
        if (!res.ok) {
          showError(res.error)
          break
        }
      }
      await refresh(repoPath)
    })
  }

  const handleMarkResolved = (paths: string[]): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.markResolved(repoPath, paths)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
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

  const focusSearch = (): void => {
    setFullScreenHash(null)
    setShowLaunchpad(false)
    setResolvingPath(null)
    setSearchFocusToken((n) => n + 1)
  }

  const startAmend = (): void => {
    setFullScreenHash(null)
    setShowLaunchpad(false)
    setSelection({ type: 'working' })
    handleAmendChange(true)
  }

  /** Everything the command palette offers, in the order shown before anything is typed. */
  const paletteCommands = (): Command[] => {
    const commands: Command[] = []
    const add = (id: string, label: string, run: () => void, shortcut?: string, group?: string): void => {
      commands.push({ id, label, run, shortcut, group })
    }
    if (repoPath) {
      if (undoLabel) add('undo', undoLabel, handleUndo, `${MOD}Z`)
      add('fetch', 'Fetch all remotes', handleFetch)
      add('pull', 'Pull', handlePull)
      add('push', 'Push', handlePush)
      add('search', 'Search commits', focusSearch, `${MOD}F`)
      add('commit', 'Go to uncommitted changes', () => {
        setFullScreenHash(null)
        setShowLaunchpad(false)
        setSelection({ type: 'working' })
      })
      add('amend', 'Amend last commit', startAmend)
      add('stash', 'Stash changes', handleStash)
      add('stash-message', 'Stash changes with a message…', handleStashWithMessage)
      for (const stash of stashes) {
        add(`stash-apply-${stash.ref}`, `Apply ${stash.ref}: ${stash.message}`, () => stashActions.apply(stash), undefined, 'Stash')
        add(`stash-pop-${stash.ref}`, `Pop ${stash.ref}: ${stash.message}`, () => stashActions.pop(stash), undefined, 'Stash')
      }
      add('new-branch', 'Create branch…', async () => {
        const name = await askText({ title: 'Create branch', label: 'Branch name', submitLabel: 'Create branch' })
        if (name) handleCreateBranch(name)
      })
      for (const b of branches) {
        if (b.current) continue
        if (b.remote) {
          if (branches.some((l) => !l.remote && l.upstream === b.name)) continue
          add(`checkout-${b.name}`, `Check out ${b.name}`, () => handleCheckoutRemote(b.name), undefined, 'Branch')
        } else {
          add(`checkout-${b.name}`, `Check out ${b.name}`, () => handleCheckout(b.name), undefined, 'Branch')
        }
      }
      for (const b of branches) {
        if (!b.current && !b.remote) add(`merge-${b.name}`, `Merge ${b.name} into ${status?.branch ?? 'HEAD'}`, () => handleMerge(b.name), undefined, 'Branch')
      }
      add('launchpad', showLaunchpad ? 'Close Launchpad' : 'Open Launchpad', () => setShowLaunchpad((v) => !v))
      add('claude', showClaude ? 'Hide Claude' : 'Show Claude', () => setShowClaude((v) => !v), 'Ctrl+Esc')
    }
    add('terminal', showTerminal ? 'Hide terminal' : 'Show terminal', () => setShowTerminal((v) => !v), 'Ctrl+`')
    add('open-repo', 'Open repository…', handleOpenRepo, `${MOD}O`)
    for (const path of recentRepos) {
      if (path !== repoPath) add(`recent-${path}`, `Open ${repoDisplayName(path)}`, () => handleOpenRecentRepo(path), undefined, 'Repository')
    }
    add('settings', 'Settings', () => setShowSettings(true), `${MOD},`)
    return commands
  }

  // App-wide shortcuts. A ref keeps the listener's view of state current
  // without re-registering it on every render.
  const shortcutHandlers = useRef<(e: KeyboardEvent) => void>(() => {})
  shortcutHandlers.current = (e: KeyboardEvent): void => {
    if (prompt || showSettings) return
    const key = e.key.toLowerCase()
    if ((isPrimary(e) && key === 'k') || (isPrimary(e, true) && key === 'p')) {
      e.preventDefault()
      setShowPalette((v) => !v)
      return
    }
    if (showPalette) return
    if (isPrimary(e) && key === 'f' && repoPath) {
      e.preventDefault()
      focusSearch()
    } else if (isPrimary(e) && key === 'z' && !isTyping(e.target) && repoPath) {
      e.preventDefault()
      if (!busy) handleUndo()
    } else if (isPrimary(e) && key === 'o') {
      e.preventDefault()
      handleOpenRepo()
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

  return (
    <div className="app">
      <TopBar
        repoPath={repoPath}
        status={status}
        branches={branches}
        busy={busy}
        onOpenRepo={handleOpenRepo}
        recentRepos={recentRepos}
        onOpenRecentRepo={handleOpenRecentRepo}
        onPush={handlePush}
        onPull={handlePull}
        onFetch={handleFetch}
        fetching={fetching}
        undoLabel={undoLabel}
        onUndo={handleUndo}
        onStash={handleStash}
        onStashPop={handleStashPop}
        onCheckout={handleCheckout}
        onOpenSettings={() => setShowSettings(true)}
        terminalVisible={showTerminal}
        onToggleTerminal={() => setShowTerminal((v) => !v)}
        claudeVisible={showClaude}
        onToggleClaude={() => setShowClaude((v) => !v)}
        launchpadActive={showLaunchpad}
        onToggleLaunchpad={() => setShowLaunchpad((v) => !v)}
      />
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner" role="status" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      <div className="workspace-row">
        <div className="workspace">
          <div className="workspace-main">
            {!repoPath ? (
              <div className="empty-state">
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
            ) : showLaunchpad ? (
              <Launchpad
                repoPath={repoPath}
                onClose={() => setShowLaunchpad(false)}
                onOpenTerminal={() => setShowTerminal(true)}
              />
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
              />
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
                />
                {selection.type !== 'none' && (
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
                        setFullScreenHash(hash)
                        setFullScreenPath(path)
                      }}
                      operation={operation}
                      conflictActions={{
                        onOpenConflict: setResolvingPath,
                        onTakeSide: handleTakeSide,
                        onMarkResolved: handleMarkResolved,
                        onContinue: handleContinue,
                        onAbort: handleAbort,
                        onSkip: handleSkip
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <TerminalPanel
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
        />
      )}
      {showPalette && <CommandPalette commands={paletteCommands()} onClose={() => setShowPalette(false)} />}
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
    </div>
  )
}
