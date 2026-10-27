import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { BranchInfo, PullMode, RepoStatus } from '../../../shared/types'
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
  /** Pulls the way the Pull menu last chose, or `mode` when picked from the menu. */
  onPull: (mode?: PullMode) => void
  pullMode: PullMode
  onFetch: () => void
  fetching: boolean
  hasRemotes: boolean
  /** What Undo would do, e.g. "Undo commit “x”"; null disables the button. */
  undoLabel: string | null
  onUndo: () => void
  /** What Redo would do; null disables the button. */
  redoLabel: string | null
  onRedo: () => void
  onCreateBranch: () => void
  hasChanges: boolean
  stashCount: number
  onStash: () => void
  onStashPop: () => void
  actionsOpen: boolean
  onToggleActions: () => void
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


function RedoIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M11 3.5 13.5 6 11 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 6h-7a3.5 3.5 0 0 0 0 7H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function NewBranchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="4.5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 5v6M4.5 10.5c0-2 1.6-3 3.5-3.3l2-.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function ActionsIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="5.5" width="13" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 1.5v2M8 12.5v2M6.8 2.3 8 3.5l1.2-1.2M6.8 13.7 8 12.5l1.2 1.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const PULL_OPTIONS: { mode: PullMode; label: string }[] = [
  { mode: 'ff', label: 'Pull (fast-forward if possible)' },
  { mode: 'ff-only', label: 'Pull (fast-forward only)' },
  { mode: 'rebase', label: 'Pull (rebase)' }
]

interface ToolButtonProps {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
  /** The accessible name, when it should differ from the visible label. */
  ariaLabel?: string
  active?: boolean
  badge?: number
}

/** A GitKraken-style toolbar button: a small label above its icon. */
function ToolButton({ label, icon, onClick, disabled, title, ariaLabel, active, badge }: ToolButtonProps): JSX.Element {
  return (
    <button
      className={`tool-button ${active ? 'tool-button-active' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? label}
    >
      <span className="tool-label">{label}</span>
      <span className="tool-icon">
        {icon}
        {badge ? <span className="tool-badge">{badge}</span> : null}
      </span>
    </button>
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
  pullMode,
  onFetch,
  fetching,
  hasRemotes,
  undoLabel,
  onUndo,
  redoLabel,
  onRedo,
  onCreateBranch,
  hasChanges,
  stashCount,
  onStash,
  onStashPop,
  actionsOpen,
  onToggleActions,
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
  const [showPullMenu, setShowPullMenu] = useState(false)
  const menuOpen = showBranchMenu || showRepoMenu || showPullMenu

  // Escape closes whichever top-bar menu is open.
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setShowBranchMenu(false)
      setShowRepoMenu(false)
      setShowPullMenu(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [menuOpen])
  const repoName = repoPath ? repoDisplayName(repoPath) : null
  const localBranches = branches.filter((b) => !b.remote)
  const pullLabel = PULL_OPTIONS.find((o) => o.mode === pullMode)?.label ?? 'Pull'
  const noRemote = 'This repository has no remotes'
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
      {repoPath && (
        <div className="toolbar" role="toolbar" aria-label="Git actions">
          <ToolButton
            label="Undo"
            icon={<UndoIcon />}
            disabled={busy || !undoLabel}
            onClick={onUndo}
            title={undoLabel ? `${undoLabel} (${MOD}Z)` : 'Nothing to undo'}
          />
          <ToolButton
            label="Redo"
            icon={<RedoIcon />}
            disabled={busy || !redoLabel}
            onClick={onRedo}
            title={redoLabel ? `${redoLabel} (${MOD}⇧Z)` : 'Nothing to redo'}
          />
          <div className="tool-split">
            <ToolButton
              label={fetching ? 'Fetching' : 'Pull'}
              ariaLabel="Pull"
              icon={<PullIcon />}
              disabled={busy || !hasRemotes}
              onClick={() => onPull()}
              title={hasRemotes ? pullLabel : noRemote}
              badge={status?.behind}
            />
            <button
              className="tool-caret"
              disabled={busy || !hasRemotes}
              onClick={() => setShowPullMenu((v) => !v)}
              title={hasRemotes ? 'Fetch or choose how to pull' : noRemote}
              aria-label="Pull options"
              aria-haspopup="menu"
              aria-expanded={showPullMenu}
            >
              ▾
            </button>
            {showPullMenu && (
              <>
                <div className="dropdown-backdrop" onClick={() => setShowPullMenu(false)} />
                <div className="branch-dropdown tool-menu" role="menu" aria-label="Pull options">
                  <div
                    role="menuitem"
                    className="branch-dropdown-item"
                    aria-disabled={fetching}
                    onClick={() => {
                      setShowPullMenu(false)
                      if (!fetching) onFetch()
                    }}
                  >
                    <FetchIcon /> Fetch
                  </div>
                  {PULL_OPTIONS.map((option) => (
                    <div
                      key={option.mode}
                      role="menuitemradio"
                      aria-checked={option.mode === pullMode}
                      className="branch-dropdown-item"
                      onClick={() => {
                        setShowPullMenu(false)
                        onPull(option.mode)
                      }}
                    >
                      <span className="tool-menu-check">{option.mode === pullMode ? '✓' : ''}</span>
                      {option.label}
                    </div>
                  ))}
                  <div className="dropdown-separator" />
                  <div className="tool-menu-hint">Picking a pull option makes it what the Pull button does.</div>
                </div>
              </>
            )}
          </div>
          <ToolButton
            label="Push"
            icon={<PushIcon />}
            disabled={busy || !hasRemotes}
            onClick={onPush}
            title={hasRemotes ? 'Push to remote' : noRemote}
            badge={status?.ahead}
          />
          <ToolButton
            label="Branch"
            ariaLabel="Create branch"
            icon={<NewBranchIcon />}
            disabled={busy}
            onClick={onCreateBranch}
            title="Create a branch here and check it out"
          />
          <ToolButton
            label="Stash"
            icon={<StashIcon />}
            disabled={busy || !hasChanges}
            onClick={onStash}
            title={hasChanges ? 'Stash working directory changes' : 'No changes to stash'}
          />
          <ToolButton
            label="Pop"
            icon={<PopIcon />}
            disabled={busy || stashCount === 0}
            onClick={onStashPop}
            title={stashCount > 0 ? 'Pop the most recent stash' : 'No stashes'}
          />
          <div className="toolbar-divider" />
          <ToolButton
            label="Terminal"
            icon={<TerminalIcon />}
            active={terminalVisible}
            onClick={onToggleTerminal}
            title="Toggle terminal (Ctrl+`)"
          />
        </div>
      )}
      <div className="top-bar-right">
        <ToolButton
          label="Actions"
          icon={<ActionsIcon />}
          active={actionsOpen}
          onClick={onToggleActions}
          title={`Search for commands and actions (${MOD}K)`}
        />
        {repoPath && (
          <button
            className={`icon-button ${launchpadActive ? 'icon-button-active' : ''}`}
            onClick={onToggleLaunchpad}
            title="Launchpad — your open pull requests"
          >
            <LaunchpadIcon />
          </button>
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
        {!repoPath && (
          <button
            className={`icon-button ${terminalVisible ? 'icon-button-active' : ''}`}
            onClick={onToggleTerminal}
            title="Toggle terminal (Ctrl+`)"
          >
            <TerminalIcon />
          </button>
        )}
        <button className="icon-button" onClick={onOpenSettings} title="Settings">
          <GearIcon />
        </button>
      </div>
    </div>
  )
}
