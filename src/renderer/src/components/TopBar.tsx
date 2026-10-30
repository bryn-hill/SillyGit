import { useEffect, useState, type JSX } from 'react'
import type { BranchInfo, PullMode, RepoStatus } from '../../../shared/types'
import type { RunMode } from '../../../shared/run'
import type { SelfUpdateStatus } from '../../../shared/selfUpdate'
import type { InstalledEditor } from '../../../shared/editors'
import { SparkIcon } from './claude/ClaudePanel'
import { repoDisplayName } from '../lib/repoName'
import { MOD } from '../lib/shortcuts'
import ToolButton from './topBar/ToolButton'
import { WORKSPACE_BRANCH } from '../../../shared/lanes'
import {
  ActionsIcon,
  BranchIcon,
  ChevronIcon,
  CodeIcon,
  FetchIcon,
  FolderIcon,
  GearIcon,
  MoreIcon,
  NewBranchIcon,
  PopIcon,
  PullIcon,
  PushIcon,
  RedoIcon,
  RunIcon,
  StashIcon,
  StopIcon,
  TerminalIcon,
  UndoIcon,
  UpdateIcon
} from './topBar/icons'
import { PULL_OPTIONS, RUN_OPTIONS, runTitle, updateTitle } from './topBar/options'
import HelpMenu from '../help/HelpMenu'

interface Props {
  repoPath: string | null
  status: RepoStatus | null
  branches: BranchInfo[]
  busy: boolean
  onOpenRepo: () => void
  recentRepos: string[]
  onOpenRecentRepo: (path: string) => void
  onPush: () => void
  /** With no remote, Push becomes Publish: create the repository on a signed-in host and push to it. */
  onPublish: () => void
  /** Force pushes the current branch with a lease, after confirming. */
  onForcePush: () => void
  /** Opens the Push to dialog to pick the remote and branch. */
  onPushTo: () => void
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
  /** The repo's run command; null until one is set (Run then asks for it). */
  runCommand: string | null
  /** The commit Run acts on, or null to run the working tree. */
  runCommit: string | null
  runMode: RunMode
  /** Whether the run the Run button would start is already going. */
  running: boolean
  preparingRun: boolean
  /** Runs the way the Run menu last chose, or `mode` when picked from the menu. */
  onRun: (mode?: RunMode) => void
  onStopRun: () => void
  onEditRunCommand: () => void
  onEditRunCopyFiles: () => void
  terminalVisible: boolean
  onToggleTerminal: () => void
  /** The editor the Open in button uses, or null when none was found. */
  editor: InstalledEditor | null
  /** Every editor found, for the button's menu. */
  editors: InstalledEditor[]
  onOpenInEditor: () => void
  /** Makes `editor` the button's editor and opens the repo in it. */
  onChooseEditor: (editor: InstalledEditor) => void
  claudeVisible: boolean
  onToggleClaude: () => void
  /** Where SillyGit's own checkout stands against origin/main; the Update button hides for packaged builds. */
  selfUpdate: SelfUpdateStatus
  updating: boolean
  onOpenUpdate: () => void
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
  onPublish,
  onForcePush,
  onPushTo,
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
  runCommand,
  runCommit,
  runMode,
  running,
  preparingRun,
  onRun,
  onStopRun,
  onEditRunCommand,
  onEditRunCopyFiles,
  terminalVisible,
  onToggleTerminal,
  editor,
  editors,
  onOpenInEditor,
  onChooseEditor,
  claudeVisible,
  onToggleClaude,
  selfUpdate,
  updating,
  onOpenUpdate
}: Props): JSX.Element {
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [showRepoMenu, setShowRepoMenu] = useState(false)
  const [showPullMenu, setShowPullMenu] = useState(false)
  const [showPushMenu, setShowPushMenu] = useState(false)
  const [showRunMenu, setShowRunMenu] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showEditorMenu, setShowEditorMenu] = useState(false)
  const menuOpen = showBranchMenu || showRepoMenu || showPullMenu || showPushMenu || showRunMenu || showMoreMenu || showEditorMenu

  // Escape closes whichever top-bar menu is open.
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setShowBranchMenu(false)
      setShowRepoMenu(false)
      setShowPullMenu(false)
      setShowPushMenu(false)
      setShowRunMenu(false)
      setShowMoreMenu(false)
      setShowEditorMenu(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [menuOpen])
  const repoName = repoPath ? repoDisplayName(repoPath) : null
  const localBranches = branches.filter((b) => !b.remote)
  const pullLabel = PULL_OPTIONS.find((o) => o.mode === pullMode)?.label ?? 'Pull'
  const noRemote = 'This repository has no remotes'
  return (
    <div className="top-bar" data-testid="top-bar">
      <div className="top-bar-left">
        <div className="breadcrumb">
          <div className="breadcrumb-segment-wrap breadcrumb-repo">
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
                    <span className="breadcrumb-value">{status.branch === WORKSPACE_BRANCH ? 'Lanes' : status.branch}</span>
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
            tour="toolbar-undo"
            icon={<UndoIcon />}
            disabled={busy || !undoLabel}
            onClick={onUndo}
            title={undoLabel ? `${undoLabel} (${MOD}Z)` : 'Nothing to undo'}
          />
          <ToolButton
            label="Redo"
            className="tool-overflowable"
            icon={<RedoIcon />}
            disabled={busy || !redoLabel}
            onClick={onRedo}
            title={redoLabel ? `${redoLabel} (${MOD}⇧Z)` : 'Nothing to redo'}
          />
          <div className="tool-split" data-tour="toolbar-pull">
            <ToolButton
              label={fetching ? 'Fetching' : 'Pull'}
              ariaLabel="Pull"
              icon={<PullIcon />}
              disabled={busy || !hasRemotes}
              onClick={() => onPull()}
              title={hasRemotes ? `${pullLabel} (${MOD}⇧L)` : noRemote}
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
                    title={`Fetch all remotes (${MOD}⇧F)`}
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
          {hasRemotes ? (
            <div className="tool-split">
              <ToolButton
                label="Push"
                icon={<PushIcon />}
                disabled={busy}
                onClick={onPush}
                title={`Push to remote (${MOD}⇧U)`}
                badge={status?.ahead}
              />
              <button
                className="tool-caret"
                disabled={busy || !status?.branch}
                onClick={() => setShowPushMenu((v) => !v)}
                title="Force push, or choose where to push"
                aria-label="Push options"
                aria-haspopup="menu"
                aria-expanded={showPushMenu}
              >
                ▾
              </button>
              {showPushMenu && (
                <>
                  <div className="dropdown-backdrop" onClick={() => setShowPushMenu(false)} />
                  <div className="branch-dropdown tool-menu" role="menu" aria-label="Push options">
                    {[
                      { label: 'Push', run: onPush },
                      { label: 'Force push (with lease)…', run: onForcePush },
                      { label: 'Push to…', run: onPushTo }
                    ].map((item) => (
                      <div
                        key={item.label}
                        role="menuitem"
                        className="branch-dropdown-item"
                        onClick={() => {
                          setShowPushMenu(false)
                          item.run()
                        }}
                      >
                        {item.label}
                      </div>
                    ))}
                    <div className="dropdown-separator" />
                    <div className="tool-menu-hint">
                      A force push with lease replaces the remote branch only if nobody pushed there since you last caught up.
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <ToolButton
              label="Publish"
              ariaLabel="Publish repository"
              icon={<PushIcon />}
              disabled={busy}
              onClick={onPublish}
              title="This repository has no remote yet. Create it on GitHub, GitLab, Bitbucket or Azure DevOps and push to it"
            />
          )}
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
            className="tool-overflowable"
            icon={<StashIcon />}
            disabled={busy || !hasChanges}
            onClick={onStash}
            title={hasChanges ? 'Stash working directory changes' : 'No changes to stash'}
          />
          <ToolButton
            label="Pop"
            className="tool-overflowable"
            icon={<PopIcon />}
            disabled={busy || stashCount === 0}
            onClick={onStashPop}
            title={stashCount > 0 ? 'Pop the most recent stash' : 'No stashes'}
          />
          <div className="tool-split tool-more">
            <ToolButton
              label="More"
              ariaLabel="More actions"
              icon={<MoreIcon />}
              active={showMoreMenu}
              onClick={() => setShowMoreMenu((v) => !v)}
              title="Redo, stash and pop"
            />
            {showMoreMenu && (
              <>
                <div className="dropdown-backdrop" onClick={() => setShowMoreMenu(false)} />
                <div className="branch-dropdown tool-menu" role="menu" aria-label="More actions">
                  {[
                    { label: 'Redo', icon: <RedoIcon />, enabled: !busy && !!redoLabel, run: onRedo },
                    { label: 'Stash', icon: <StashIcon />, enabled: !busy && hasChanges, run: onStash },
                    { label: 'Pop', icon: <PopIcon />, enabled: !busy && stashCount > 0, run: onStashPop }
                  ].map((item) => (
                    <div
                      key={item.label}
                      role="menuitem"
                      className="branch-dropdown-item"
                      aria-disabled={!item.enabled}
                      onClick={() => {
                        if (!item.enabled) return
                        setShowMoreMenu(false)
                        item.run()
                      }}
                    >
                      {item.icon} {item.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="toolbar-divider" />
          <div className="tool-split">
            <ToolButton
              label={running ? 'Stop' : preparingRun ? 'Preparing' : 'Run'}
              icon={running ? <StopIcon /> : <RunIcon />}
              disabled={preparingRun}
              active={running}
              onClick={() => (running ? onStopRun() : onRun())}
              title={runTitle(runCommand, runCommit, runMode, running)}
            />
            <button
              className="tool-caret"
              onClick={() => setShowRunMenu((v) => !v)}
              title="Choose how to run, or change the run command"
              aria-label="Run options"
              aria-haspopup="menu"
              aria-expanded={showRunMenu}
            >
              ▾
            </button>
            {showRunMenu && (
              <>
                <div className="dropdown-backdrop" onClick={() => setShowRunMenu(false)} />
                <div className="branch-dropdown tool-menu" role="menu" aria-label="Run options">
                  {RUN_OPTIONS.map((option) => (
                    <div
                      key={option.mode}
                      role="menuitemradio"
                      aria-checked={option.mode === runMode}
                      className="branch-dropdown-item"
                      title={option.hint}
                      onClick={() => {
                        setShowRunMenu(false)
                        onRun(option.mode)
                      }}
                    >
                      <span className="tool-menu-check">{option.mode === runMode ? '✓' : ''}</span>
                      {option.label}
                    </div>
                  ))}
                  <div className="dropdown-separator" />
                  <div
                    role="menuitem"
                    className="branch-dropdown-item"
                    onClick={() => {
                      setShowRunMenu(false)
                      onEditRunCommand()
                    }}
                  >
                    <span className="tool-menu-check" />
                    Edit run command…
                  </div>
                  <div
                    role="menuitem"
                    className="branch-dropdown-item"
                    title="Untracked files such as local.properties or appsettings.Development.json that an isolated run needs"
                    onClick={() => {
                      setShowRunMenu(false)
                      onEditRunCopyFiles()
                    }}
                  >
                    <span className="tool-menu-check" />
                    Files to copy into isolated runs…
                  </div>
                  <div className="dropdown-separator" />
                  <div className="tool-menu-hint">
                    {runCommand ? (
                      <>
                        Runs <code>{runCommand}</code>.{' '}
                      </>
                    ) : null}
                    With a commit selected, the option picked here is what Run does. With the uncommitted changes row
                    selected, Run runs your working tree.
                  </div>
                </div>
              </>
            )}
          </div>
          <ToolButton
            label="Terminal"
            icon={<TerminalIcon />}
            active={terminalVisible}
            onClick={onToggleTerminal}
            title="Toggle terminal (Ctrl+`)"
          />
          <div className="tool-split">
            <ToolButton
              label={editor?.short ?? 'Editor'}
              ariaLabel="Editor"
              icon={<CodeIcon />}
              onClick={() => (editor ? onOpenInEditor() : onOpenSettings())}
              title={
                editor
                  ? `Open ${repoName} in ${editor.name} (${MOD}⇧A)`
                  : 'No code editor found. Choose one, or set a command for yours, in Settings'
              }
            />
            <button
              className="tool-caret"
              onClick={() => setShowEditorMenu((v) => !v)}
              title="Choose the editor to open in"
              aria-label="Editor options"
              aria-haspopup="menu"
              aria-expanded={showEditorMenu}
            >
              ▾
            </button>
            {showEditorMenu && (
              <>
                <div className="dropdown-backdrop" onClick={() => setShowEditorMenu(false)} />
                <div className="branch-dropdown tool-menu" role="menu" aria-label="Editor options">
                  {editors.length === 0 && editor?.id !== 'custom' && (
                    <div className="tool-menu-hint">No code editors or IDEs were found.</div>
                  )}
                  {[...editors, ...(editor?.id === 'custom' ? [editor] : [])].map((option) => (
                    <div
                      key={option.id}
                      role="menuitemradio"
                      aria-checked={option.id === editor?.id}
                      className="branch-dropdown-item"
                      onClick={() => {
                        setShowEditorMenu(false)
                        onChooseEditor(option)
                      }}
                    >
                      <span className="tool-menu-check">{option.id === editor?.id ? '✓' : ''}</span>
                      Open in {option.name}
                    </div>
                  ))}
                  <div className="dropdown-separator" />
                  <div
                    role="menuitem"
                    className="branch-dropdown-item"
                    onClick={() => {
                      setShowEditorMenu(false)
                      onOpenSettings()
                    }}
                  >
                    <span className="tool-menu-check" />
                    Editor settings…
                  </div>
                  <div className="dropdown-separator" />
                  <div className="tool-menu-hint">
                    Picking an editor makes it what the button opens. Right-click a file to open just that file.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="top-bar-right">
        {selfUpdate.supported && (
          <ToolButton
            label={updating ? 'Updating' : 'Update'}
            ariaLabel="Update SillyGit"
            icon={<UpdateIcon />}
            active={updating || selfUpdate.behind > 0}
            onClick={onOpenUpdate}
            title={updateTitle(selfUpdate, updating)}
            badge={selfUpdate.behind}
          />
        )}
        <ToolButton
          label="Actions"
          tour="command-palette"
          icon={<ActionsIcon />}
          active={actionsOpen}
          onClick={onToggleActions}
          title={`Search for commands and actions (${MOD}K)`}
        />
        {repoPath && (
          <button
            className={`icon-button ${claudeVisible ? 'icon-button-active' : ''}`}
            onClick={onToggleClaude}
            data-tour="ai-panel"
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
        <HelpMenu />
        <button className="icon-button" onClick={onOpenSettings} title="Settings" data-tour="settings">
          <GearIcon />
        </button>
      </div>
    </div>
  )
}
