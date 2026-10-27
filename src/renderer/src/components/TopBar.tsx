import { useState, type JSX } from 'react'
import type { BranchInfo, RepoStatus } from '../../../shared/types'
import { SparkIcon } from './claude/ClaudePanel'
import { repoDisplayName } from '../lib/repoName'
import { MOD } from '../lib/shortcuts'

interface Props {
  repoPath: string | null
  status: RepoStatus | null
  branches: BranchInfo[]
  busy: boolean
  onOpenRepo: () => void
  recentRepos: string[]
  onOpenRecentRepo: (path: string) => void
  onPush: () => void
  onPull: () => void
  onFetch: () => void
  fetching: boolean
  /** What Undo would do, e.g. "Undo commit “x”"; null disables the button. */
  undoLabel: string | null
  onUndo: () => void
  onStash: () => void
  onStashPop: () => void
  onCheckout: (branch: string) => void
  onOpenSettings: () => void
  terminalVisible: boolean
  onToggleTerminal: () => void
  claudeVisible: boolean
  onToggleClaude: () => void
  launchpadActive: boolean
  onToggleLaunchpad: () => void
}

function FolderIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3.4l1.2 1.5h5.4a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BranchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="4.5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.5 5v6M4.5 8c0-1.5 1.3-2.8 3-2.8h2.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChevronIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PullIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function PushIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 13.5v-8M4.5 9 8 5.5 11.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 2.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function FetchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M13 8a5 5 0 1 1-1.5-3.55M13 2.5v2.5h-2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UndoIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M5 3.5 2.5 6 5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 6h7a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function StashIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="5.5" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 5.5 4.5 2.5h7l2 3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function PopIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="5.5" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 5.5 4.5 2.5h7l2 3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 6.8V11M6 9l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LaunchpadIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.8c2.4 1 3.6 3.3 3.6 6.2 0 1.6-.4 3-1 4.1l-2.6 1.4-2.6-1.4c-.6-1.1-1-2.5-1-4.1 0-2.9 1.2-5.2 3.6-6.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="7.2" r="1.3" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5.6 11 4 14.2M10.4 11 12 14.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function TerminalIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 6.2 6.8 8 4 9.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 9.8h3.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function GearIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M6.61 3.3 6.91 1.8h2.18l.3 1.5.95.39 1.27-.85 1.55 1.55-.85 1.27.39.95 1.5.3v2.18l-1.5.3-.39.95.85 1.27-1.55 1.55-1.27-.85-.95.39-.3 1.5H6.91l-.3-1.5-.95-.39-1.27.85-1.55-1.55.85-1.27-.39-.95-1.5-.3V6.91l1.5-.3.39-.95-.85-1.27 1.55-1.55 1.27.85Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export default function TopBar({
  repoPath,
  status,
  branches,
  busy,
  onOpenRepo,
  recentRepos,
  onOpenRecentRepo,
  onPush,
  onPull,
  onFetch,
  fetching,
  undoLabel,
  onUndo,
  onStash,
  onStashPop,
  onCheckout,
  onOpenSettings,
  terminalVisible,
  onToggleTerminal,
  claudeVisible,
  onToggleClaude,
  launchpadActive,
  onToggleLaunchpad
}: Props): JSX.Element {
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [showRepoMenu, setShowRepoMenu] = useState(false)
  const repoName = repoPath ? repoDisplayName(repoPath) : null
  const localBranches = branches.filter((b) => !b.remote)

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <div className="breadcrumb">
          <div className="breadcrumb-segment-wrap">
            <button
              className="breadcrumb-segment"
              onClick={() => (recentRepos.length > 0 ? setShowRepoMenu((v) => !v) : onOpenRepo())}
              title={repoPath ?? 'Open a repository'}
            >
              <FolderIcon />
              <span className="breadcrumb-text">
                <span className="breadcrumb-label">Repository</span>
                <span className="breadcrumb-value">{repoName ?? 'Open repository…'}</span>
              </span>
              {recentRepos.length > 0 && <span className="caret">▾</span>}
            </button>
            {showRepoMenu && (
              <>
                <div className="dropdown-backdrop" onClick={() => setShowRepoMenu(false)} />
                <div className="branch-dropdown" role="menu" aria-label="Repositories">
                  {recentRepos.map((path) => (
                    <div
                      key={path}
                      role="menuitem"
                      className={`branch-dropdown-item ${path === repoPath ? 'current' : ''}`}
                      title={path}
                      onClick={() => {
                        setShowRepoMenu(false)
                        onOpenRecentRepo(path)
                      }}
                    >
                      {path === repoPath ? '● ' : ''}
                      {repoDisplayName(path)}
                    </div>
                  ))}
                  <div className="dropdown-separator" />
                  <div
                    role="menuitem"
                    className="branch-dropdown-item"
                    onClick={() => {
                      setShowRepoMenu(false)
                      onOpenRepo()
                    }}
                  >
                    Open repository…
                  </div>
                </div>
              </>
            )}
          </div>
          {status?.branch && (
            <>
              <span className="breadcrumb-chevron">
                <ChevronIcon />
              </span>
              <div className="breadcrumb-segment-wrap">
                <button className="breadcrumb-segment" onClick={() => setShowBranchMenu((v) => !v)}>
                  <BranchIcon />
                  <span className="breadcrumb-text">
                    <span className="breadcrumb-label">Branch</span>
                    <span className="breadcrumb-value">{status.branch}</span>
                  </span>
                  <span className="caret">▾</span>
                </button>
                {showBranchMenu && (
                  <>
                    <div className="dropdown-backdrop" onClick={() => setShowBranchMenu(false)} />
                    <div className="branch-dropdown">
                      {localBranches.map((b) => (
                        <div
                          key={b.name}
                          className={`branch-dropdown-item ${b.current ? 'current' : ''}`}
                          onClick={() => {
                            if (!b.current) onCheckout(b.name)
                            setShowBranchMenu(false)
                          }}
                        >
                          {b.current ? '● ' : ''}
                          {b.name}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="top-bar-right">
        {repoPath && (
          <>
            <button
              disabled={busy || !undoLabel}
              onClick={onUndo}
              title={undoLabel ? `${undoLabel} (${MOD}Z)` : 'Nothing to undo'}
              aria-label="Undo"
            >
              <UndoIcon />
              Undo
            </button>
            <div className="button-group">
              <button disabled={busy || fetching} onClick={onFetch} title="Fetch all remotes">
                <FetchIcon />
                {fetching ? 'Fetching…' : 'Fetch'}
              </button>
              <button disabled={busy} onClick={onPull} title="Pull from remote">
                <PullIcon />
                Pull{status && status.behind > 0 ? ` (${status.behind})` : ''}
              </button>
              <button disabled={busy} onClick={onPush} title="Push to remote">
                <PushIcon />
                Push{status && status.ahead > 0 ? ` (${status.ahead})` : ''}
              </button>
            </div>
            <div className="button-group">
              <button disabled={busy} onClick={onStash} title="Stash working directory changes">
                <StashIcon />
                Stash
              </button>
              <button disabled={busy} onClick={onStashPop} title="Pop the most recent stash">
                <PopIcon />
                Pop
              </button>
            </div>
            <button
              className={`icon-button ${launchpadActive ? 'icon-button-active' : ''}`}
              onClick={onToggleLaunchpad}
              title="Launchpad — your open pull requests"
            >
              <LaunchpadIcon />
            </button>
          </>
        )}
        {repoPath && (
          <button
            className={`icon-button ${claudeVisible ? 'icon-button-active' : ''}`}
            onClick={onToggleClaude}
            title="Claude Code (Ctrl+Esc)"
          >
            <SparkIcon />
          </button>
        )}
        <button
          className={`icon-button ${terminalVisible ? 'icon-button-active' : ''}`}
          onClick={onToggleTerminal}
          title="Toggle terminal (Ctrl+`)"
        >
          <TerminalIcon />
        </button>
        <button className="icon-button" onClick={onOpenSettings} title="Settings">
          <GearIcon />
        </button>
      </div>
    </div>
  )
}
