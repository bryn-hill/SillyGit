import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BranchInfo, FileStatus, GraphCommit, RepoStatus } from '../../shared/types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import CommitGraph from './components/CommitGraph'
import DetailPanel from './components/DetailPanel'
import CommitFullView from './components/CommitFullView'
import SettingsModal from './components/SettingsModal'
import TerminalPanel, { DEFAULT_HEIGHT as DEFAULT_TERMINAL_HEIGHT } from './components/TerminalPanel'
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
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'Backquote' && e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        setShowTerminal((v) => !v)
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
      />
      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <div className="workspace">
        <div className="workspace-main">
          {!repoPath ? (
            <div className="empty-state">
              <p>No repository open.</p>
              <button onClick={handleOpenRepo}>Open Repository</button>
            </div>
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
                onSelectWorking={() => setSelection({ type: 'working' })}
                onSelectCommit={(hash) => {
                  setSelection({ type: 'commit', hash })
                  setFullScreenHash(hash)
                }}
                onCheckout={handleCheckout}
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
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
