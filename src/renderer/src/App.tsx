import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type {
  BranchInfo,
  OpenPullRequest,
  RepoRemote,
  ConflictableResult,
  FileStatus,
  GraphCommit,
  OperationState,
  RepoStatus
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
import { resolveBranchRemote } from '../../shared/branchRemote'
import type { RefActions, RefTarget } from './components/RefContextMenu'

// 'none' means nothing is selected and the side bar is closed.
export type Selection = { type: 'none' } | { type: 'working' } | { type: 'commit'; hash: string }

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

  const refresh = useCallback(async (path: string) => {
    const [statusRes, branchesRes, graphRes, operationRes, remotesRes] = await Promise.all([
      window.api.getStatus(path),
      window.api.branches(path),
      window.api.graphLog(path),
      window.api.operationState(path),
      window.api.remotes(path)
    ])
    setRemotes(remotesRes.ok ? remotesRes.data : [])
    if (statusRes.ok) setStatus(statusRes.data)
    else showError(statusRes.error)
    setOperation(operationRes.ok ? operationRes.data : null)
    if (branchesRes.ok) setBranches(branchesRes.data)
    if (graphRes.ok) setGraphCommits(graphRes.data)
  }, [])

  useEffect(() => {
    if (repoPath) refresh(repoPath)
  }, [repoPath, refresh])

  // Open pull requests come from GitHub via gh, which takes a second or two, so
  // they load in the background (on open, then at most once a minute when the
  // window regains focus) and the branch menu reads them from here.
  useEffect(() => {
    setPullRequests([])
    if (!repoPath) return
    let cancelled = false
    let lastFetch = 0
    const load = (): void => {
      if (Date.now() - lastFetch < 60_000) return
      lastFetch = Date.now()
      window.api.openPullRequests(repoPath).then((res) => {
        if (!cancelled && res.ok) setPullRequests(res.data)
      })
    }
    load()
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      window.removeEventListener('focus', load)
    }
  }, [repoPath])

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
  const hasWorkingChanges =
    !!status && (status.staged.length > 0 || status.unstaged.length > 0 || conflictCount > 0 || !!operation)

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

  useEffect(() => {
    if (graphRows.length === 0 || selection.type === 'none') return
    const selectedExists =
      selection.type === 'commit' && graphRows.some((r) => r.commit.hash === selection.hash)
    if (!hasWorkingChanges && (selection.type === 'working' || !selectedExists)) {
      setSelection({ type: 'commit', hash: graphRows[0].commit.hash })
    } else if (hasWorkingChanges && selection.type === 'commit' && !selectedExists) {
      setSelection({ type: 'working' })
    }
  }, [hasWorkingChanges, selection, graphRows])

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
      const current = items.findIndex((item) =>
        item.type === 'commit'
          ? selection.type === 'commit' && selection.hash === item.hash
          : selection.type === item.type
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
    setRepoPath(picked)
    setResolvingPath(null)
    setSelection({ type: 'working' })
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
      const res = await window.api.commit(repoPath, commitMessage.trim())
      if (!res.ok) {
        showError(res.error)
        return
      }
      setCommitMessage('')
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

  const handleStashPop = (): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.stashPop(repoPath)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleCherryPick = (hash: string): void => runConflictable((path) => window.api.cherryPick(path, hash))

  const handleRevertCommit = (hash: string): void =>
    runConflictable((path) => window.api.revertCommit(path, hash))

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
    remoteInfo: (target) => resolveBranchRemote(target, branches, remotes, pullRequests)
  }

  return (
    <div className="app">
      <TopBar
        repoPath={repoPath}
        status={status}
        branches={branches}
        busy={busy}
        onOpenRepo={handleOpenRepo}
        onPush={handlePush}
        onPull={handlePull}
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
                  actions={refActions}
                />
                <CommitGraph
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
                  onSelectCommit={(hash) =>
                    setSelection(
                      selection.type === 'commit' && selection.hash === hash
                        ? { type: 'none' }
                        : { type: 'commit', hash }
                    )
                  }
                  onCheckout={handleCheckout}
                  actions={refActions}
                />
                {selection.type !== 'none' && (
                  <div className="detail-panel" role="complementary" aria-label="Details">
                    <DetailPanel
                      repoPath={repoPath}
                      selection={selection}
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
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
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
