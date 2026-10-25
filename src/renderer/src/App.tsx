import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { BranchInfo, FileStatus, GraphCommit, RepoStatus } from '../../shared/types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import CommitGraph from './components/CommitGraph'
import DetailPanel from './components/DetailPanel'
import CommitFullView from './components/CommitFullView'
import Launchpad from './components/Launchpad'
import SettingsModal from './components/SettingsModal'
import TerminalPanel, { DEFAULT_HEIGHT as DEFAULT_TERMINAL_HEIGHT } from './components/TerminalPanel'
import ClaudePanel, { DEFAULT_CLAUDE_WIDTH } from './components/claude/ClaudePanel'
import { layoutGraph } from './lib/graphLayout'

export type Selection = { type: 'working' } | { type: 'commit'; hash: string }

export default function App(): JSX.Element {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [graphCommits, setGraphCommits] = useState<GraphCommit[]>([])
  const [selection, setSelection] = useState<Selection>({ type: 'working' })
  const [commitMessage, setCommitMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fullScreenHash, setFullScreenHash] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
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

  const refresh = useCallback(async (path: string) => {
    const [statusRes, branchesRes, graphRes] = await Promise.all([
      window.api.getStatus(path),
      window.api.branches(path),
      window.api.graphLog(path)
    ])
    if (statusRes.ok) setStatus(statusRes.data)
    else showError(statusRes.error)
    if (branchesRes.ok) setBranches(branchesRes.data)
    if (graphRes.ok) setGraphCommits(graphRes.data)
  }, [])

  useEffect(() => {
    if (repoPath) refresh(repoPath)
  }, [repoPath, refresh])

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

  const hasWorkingChanges = !!status && (status.staged.length > 0 || status.unstaged.length > 0)

  useEffect(() => {
    if (graphRows.length === 0) return
    const selectedExists =
      selection.type === 'commit' && graphRows.some((r) => r.commit.hash === selection.hash)
    if (!hasWorkingChanges && (selection.type === 'working' || !selectedExists)) {
      setSelection({ type: 'commit', hash: graphRows[0].commit.hash })
    } else if (hasWorkingChanges && selection.type === 'commit' && !selectedExists) {
      setSelection({ type: 'working' })
    }
  }, [hasWorkingChanges, selection, graphRows])

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
    setSelection({ type: 'working' })
  }

  const withBusy = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
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

  const handlePull = (): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.pull(repoPath)
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

  const handleCherryPick = (hash: string): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.cherryPick(repoPath, hash)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleRevertCommit = (hash: string): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.revertCommit(repoPath, hash)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
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

  const handleCreateBranchAt = (hash: string): void => {
    if (!repoPath) return
    const name = window.prompt('New branch name:')
    if (!name || !name.trim()) return
    withBusy(async () => {
      const res = await window.api.createBranchAt(repoPath, name.trim(), hash)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleCreateTag = (hash: string): void => {
    if (!repoPath) return
    const name = window.prompt('Tag name:')
    if (!name || !name.trim()) return
    withBusy(async () => {
      const res = await window.api.createTag(repoPath, name.trim(), hash)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const handleCreateAnnotatedTag = (hash: string): void => {
    if (!repoPath) return
    const name = window.prompt('Annotated tag name:')
    if (!name || !name.trim()) return
    const message = window.prompt('Tag message:', name.trim()) ?? ''
    withBusy(async () => {
      const res = await window.api.createAnnotatedTag(repoPath, name.trim(), message, hash)
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

  const handleCopySha = (hash: string): void => {
    window.api.copyToClipboard(hash)
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
            ) : fullScreenHash ? (
              <CommitFullView
                repoPath={repoPath}
                hash={fullScreenHash}
                isHead={fullScreenHash === headHash}
                onClose={() => {
                  setFullScreenHash(null)
                  refresh(repoPath)
                }}
                onNavigateToCommit={(hash) => {
                  setFullScreenHash(hash)
                  setSelection({ type: 'commit', hash })
                }}
                onWorkingTreeChanged={() => refresh(repoPath)}
              />
            ) : (
              <div className="main-layout">
                <Sidebar branches={branches} onCheckout={handleCheckout} onCreateBranch={handleCreateBranch} />
                <CommitGraph
                  rows={graphRows}
                  selection={selection}
                  hasWorkingChanges={hasWorkingChanges}
                  headHash={headHash}
                  currentBranch={status?.branch ?? null}
                  onSelectWorking={() => setSelection({ type: 'working' })}
                  onSelectCommit={(hash) => {
                    setSelection({ type: 'commit', hash })
                    setFullScreenHash(hash)
                  }}
                  onCheckout={handleCheckout}
                  onCherryPick={handleCherryPick}
                  onRevertCommit={handleRevertCommit}
                  onResetTo={handleResetTo}
                  onCreateBranchAt={handleCreateBranchAt}
                  onCreateTag={handleCreateTag}
                  onCreateAnnotatedTag={handleCreateAnnotatedTag}
                  onCreatePatch={handleCreatePatch}
                  onCopySha={handleCopySha}
                />
                <div className="detail-panel">
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
                  />
                </div>
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
    </div>
  )
}
