import { useEffect, useMemo, useState, type JSX } from 'react'
import type { CommitDetail, FileStatus, GraphCommit, OperationState, RepoStatus } from '../../../shared/types'
import type { Selection } from '../App'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import { isPrimary, MOD } from '../lib/shortcuts'
import { applyPrefix, bumpVersion, COMMIT_PREFIXES, type BumpKind, type QuickMessage } from '../../../shared/quickActions'
import Avatar from './Avatar'
import { fileMenuSections } from './fileMenu'
import { pressable } from '../lib/pressable'

const OPERATION_NAMES: Record<OperationState['kind'], string> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert'
}

/** "Merging feature into main", "Rebasing feature onto main (commit 2 of 3)" etc. */
function operationSummary(op: OperationState): string {
  switch (op.kind) {
    case 'merge':
      return `Merging ${op.incomingLabel} into ${op.currentLabel}`
    case 'rebase': {
      const progress = op.step && op.total ? ` (commit ${op.step} of ${op.total})` : ''
      return `Rebasing ${op.rebaseBranch ?? 'HEAD'} onto ${op.currentLabel}${progress}`
    }
    case 'cherry-pick':
      return `Cherry-picking ${op.incomingLabel} onto ${op.currentLabel}`
    case 'revert':
      return `Reverting ${op.incomingLabel.replace(/^revert of /, '')} on ${op.currentLabel}`
  }
}

export interface ConflictActions {
  onOpenConflict: (path: string) => void
  onTakeSide: (paths: string[], side: 'current' | 'incoming') => void
  onMarkResolved: (paths: string[]) => void
  /** The configured external merge tool's name, or null when there isn't one. */
  externalToolName: string | null
  onOpenExternal: (path: string) => void
  onContinue: () => void
  onAbort: () => void
  onSkip: () => void
}

function statusLabel(code: string): string {
  return code === '?' ? 'U' : code
}

interface WorkingProps {
  repoPath: string
  status: RepoStatus | null
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (file: FileStatus) => void
  onCommit: () => void
  amend: boolean
  onAmendChange: (amend: boolean) => void
  operation: OperationState | null
  conflictActions: ConflictActions
  onEditFile: (path: string) => void
  onOpenFileView: (path: string, ref: string | null, mode: 'history' | 'blame') => void
  onCopyText: (text: string) => void
  onOpenFile: (file: FileStatus, staged: boolean) => void
  activeFile: ActiveFile | null
}

/** The file open in the main area, marked in the side bar's lists. */
export interface ActiveFile {
  path: string
  /** For working changes: which list the file was opened from. */
  staged?: boolean
}

function WorkingDirectoryView({
  repoPath,
  status,
  commitMessage,
  onCommitMessageChange,
  onStage,
  onUnstage,
  onDiscard,
  onCommit,
  amend,
  onAmendChange,
  operation,
  conflictActions,
  onEditFile,
  onOpenFileView,
  onCopyText,
  onOpenFile,
  activeFile
}: WorkingProps): JSX.Element {
  const [conflictMenu, setConflictMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  // Conflicted files picked with Cmd/Ctrl- or Shift-click, for bulk actions.
  const [pickedConflicts, setSelectedConflicts] = useState<string[]>([])
  const [conflictAnchor, setConflictAnchor] = useState<string | null>(null)
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; file: FileStatus; isStaged: boolean } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [quickMenu, setQuickMenu] = useState<{ x: number; y: number } | null>(null)
  const [indexSuggestions, setSuggestions] = useState<QuickMessage[]>([])
  const [packageVersion, setPackageVersion] = useState<string | null>(null)

  const staged = status?.staged ?? []
  const unstaged = status?.unstaged ?? []
  const conflicted = status?.conflicted ?? []
  const conflictedKey = conflicted.map((f) => f.path).join('\0')
  // Selected files drop out once they're resolved.
  const selectedConflicts = useMemo(() => {
    const paths = new Set(conflictedKey.split('\0'))
    return pickedConflicts.every((p) => paths.has(p)) ? pickedConflicts : pickedConflicts.filter((p) => paths.has(p))
  }, [pickedConflicts, conflictedKey])
  const selectedSet = new Set(selectedConflicts)

  const clickConflict = (e: React.MouseEvent, path: string): void => {
    const order = conflicted.map((f) => f.path)
    const toggle = e.metaKey || e.ctrlKey
    if (e.shiftKey && conflictAnchor && order.includes(conflictAnchor)) {
      const [a, b] = [order.indexOf(conflictAnchor), order.indexOf(path)].sort((x, y) => x - y)
      const range = order.slice(a, b + 1)
      setSelectedConflicts(toggle ? order.filter((p) => selectedSet.has(p) || range.includes(p)) : range)
      return
    }
    if (toggle) {
      setSelectedConflicts(selectedSet.has(path) ? selectedConflicts.filter((p) => p !== path) : order.filter((p) => selectedSet.has(p) || p === path))
      setConflictAnchor(path)
      return
    }
    setSelectedConflicts([path])
    setConflictAnchor(path)
    conflictActions.onOpenConflict(path)
  }

  // Cmd/Ctrl+D opens the selected conflicted file in the external merge tool.
  useEffect(() => {
    if (!conflictActions.externalToolName || selectedConflicts.length !== 1) return
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'd' && !e.defaultPrevented) {
        e.preventDefault()
        conflictActions.onOpenExternal(selectedConflicts[0])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [conflictActions, selectedConflicts])
  const totalChanges = staged.length + unstaged.length + conflicted.length
  // Amending can just reword the last commit, with nothing staged.
  const canCommit = !!commitMessage.trim() && (amend || staged.length > 0)

  // Rule-based suggestions are cheap (no AI), so recompute whenever the index changes.
  const stagedKey = staged.map((f) => `${f.index}${f.path}`).join('\n')
  const suggestions = stagedKey ? indexSuggestions : []
  useEffect(() => {
    let cancelled = false
    if (stagedKey) {
      window.api.quickSuggestMessages(repoPath).then((res) => !cancelled && setSuggestions(res.ok ? res.data : []))
    }
    window.api.quickPackageVersion(repoPath).then((res) => !cancelled && setPackageVersion(res.ok ? res.data : null))
    return () => {
      cancelled = true
    }
  }, [repoPath, stagedKey])

  const handleBump = async (kind: BumpKind): Promise<void> => {
    setGenerateError(null)
    const res = await window.api.quickBumpVersion(repoPath, kind)
    if (!res.ok) {
      setGenerateError(res.error)
      return
    }
    onCommitMessageChange(res.data.message)
    onStage(res.data.files)
  }

  const quickMenuSections = (): ContextMenuItem[][] => {
    const sections: ContextMenuItem[][] = []
    if (suggestions.length > 0) {
      sections.push(
        suggestions.map((s) => ({
          id: `suggest-${s.id}`,
          label: s.label,
          title: s.message,
          onSelect: () => onCommitMessageChange(s.message)
        }))
      )
    }
    const tools: ContextMenuItem[] = []
    const kinds: BumpKind[] = ['patch', 'minor', 'major']
    const bumps = packageVersion ? kinds.filter((k) => bumpVersion(packageVersion, k)) : []
    if (packageVersion && bumps.length > 0) {
      tools.push({
        id: 'bump',
        label: `Bump version (${packageVersion})`,
        submenu: bumps.map((k) => ({
          id: `bump-${k}`,
          label: `${k[0].toUpperCase()}${k.slice(1)} → ${bumpVersion(packageVersion, k)}`,
          onSelect: () => void handleBump(k)
        }))
      })
    }
    tools.push({
      id: 'prefix',
      label: 'Prefix with',
      submenu: COMMIT_PREFIXES.map((p) => ({
        id: `prefix-${p}`,
        label: `${p}:`,
        onSelect: () => onCommitMessageChange(applyPrefix(commitMessage, p))
      }))
    })
    sections.push(tools)
    return sections
  }

  const handleGenerateMessage = async (): Promise<void> => {
    setGenerating(true)
    setGenerateError(null)
    const res = await window.api.aiGenerateCommitMessage(repoPath)
    setGenerating(false)
    if (res.ok) onCommitMessageChange(res.data)
    else setGenerateError(res.error)
  }

  const renderRow = (file: FileStatus, isStaged: boolean): JSX.Element => {
    const key = `${isStaged ? 's' : 'u'}:${file.path}`
    const active = activeFile?.path === file.path && !!activeFile.staged === isStaged
    return (
      <li key={key}>
        <div
          className={`file-row ${active ? 'active' : ''}`}
          aria-current={active}
          onClick={() => onOpenFile(file, isStaged)}
          onContextMenu={(e) => {
            e.preventDefault()
            setFileMenu({ x: e.clientX, y: e.clientY, file, isStaged })
          }}
        >
          <span className={`status-code code-${statusLabel(file.index !== '.' && isStaged ? file.index : file.worktree)}`}>
            {statusLabel(file.index !== '.' && isStaged ? file.index : file.worktree)}
          </span>
          <span className="file-path">{file.path}</span>
          <span className="file-actions">
            {(isStaged ? file.index : file.worktree) !== 'D' && (
              <button
                className="icon-button"
                title="Edit file"
                aria-label={`Edit ${file.path}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onEditFile(file.path)
                }}
              >
                ✎
              </button>
            )}
            {!isStaged && (
              <button
                className="icon-button"
                title="Discard changes"
                onClick={(e) => {
                  e.stopPropagation()
                  onDiscard(file)
                }}
              >
                ↺
              </button>
            )}
            <button
              className="icon-button"
              title={isStaged ? 'Unstage' : 'Stage'}
              onClick={(e) => {
                e.stopPropagation()
                isStaged ? onUnstage([file.path]) : onStage([file.path])
              }}
            >
              {isStaged ? '−' : '+'}
            </button>
          </span>
        </div>
      </li>
    )
  }

  const conflictMenuSections = (path: string): ContextMenuItem[][] => {
    // Right-clicking one of several selected files acts on all of them.
    const paths = selectedSet.has(path) && selectedConflicts.length > 1 ? selectedConflicts : [path]
    const n = paths.length
    const suffix = n > 1 ? ` ${n} files` : ''
    const open: ContextMenuItem[] =
      n > 1
        ? []
        : [
            ...(conflictActions.externalToolName
              ? [
                  {
                    id: 'open-external',
                    label: `Open in ${conflictActions.externalToolName}`,
                    title: `${MOD}D`,
                    onSelect: () => conflictActions.onOpenExternal(path)
                  }
                ]
              : []),
            { id: 'open', label: 'Open in merge tool', onSelect: () => conflictActions.onOpenConflict(path) }
          ]
    return [
      ...(open.length > 0 ? [open] : []),
      [
        {
          id: 'take-current',
          label: `Take current (${operation?.currentLabel ?? 'current'})${suffix}`,
          onSelect: () => conflictActions.onTakeSide(paths, 'current')
        },
        {
          id: 'take-incoming',
          label: `Take incoming (${operation?.incomingLabel ?? 'incoming'})${suffix}`,
          onSelect: () => conflictActions.onTakeSide(paths, 'incoming')
        }
      ],
      [{ id: 'resolve', label: n > 1 ? `Mark ${n} resolved` : 'Mark resolved', onSelect: () => conflictActions.onMarkResolved(paths) }]
    ]
  }

  const operationName = operation ? OPERATION_NAMES[operation.kind] : null

  return (
    <div className="detail-panel-content">
      {operation ? (
        <div className="operation-header" role="status" aria-label="Operation in progress">
          <div className="operation-header-title">
            <span className="operation-warning" aria-hidden="true">
              ⚠
            </span>
            {conflicted.length > 0
              ? `${operationName} conflicts detected`
              : `${operationName} in progress`}
          </div>
          <div className="operation-strip">{operationSummary(operation)}</div>
        </div>
      ) : (
        <div className="detail-header-row">
          <span>{totalChanges} file change{totalChanges === 1 ? '' : 's'} in working directory</span>
        </div>
      )}

      {conflicted.length > 0 && (
        <div className="detail-section" role="region" aria-label="Conflicted files">
          <div className="detail-section-header">
            <span>Conflicted Files ({conflicted.length})</span>
            <button
              className="mark-resolved-button"
              onClick={() =>
                conflictActions.onMarkResolved(selectedConflicts.length > 1 ? selectedConflicts : conflicted.map((f) => f.path))
              }
            >
              {selectedConflicts.length > 1 ? `Mark ${selectedConflicts.length} resolved` : 'Mark All Resolved'}
            </button>
          </div>
          <ul className="file-list">
            {conflicted.map((f) => (
              <li key={`c:${f.path}`}>
                <div
                  className={`file-row conflict-row ${conflictMenu?.path === f.path ? 'context-target' : ''} ${
                    selectedSet.has(f.path) ? 'selected' : ''
                  }`}
                  aria-selected={selectedSet.has(f.path)}
                  onClick={(e) => clickConflict(e, f.path)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setConflictMenu({ x: e.clientX, y: e.clientY, path: f.path })
                  }}
                >
                  <span className="status-code code-conflict" title={`Conflict (${f.index}${f.worktree})`}>
                    !
                  </span>
                  <span className="file-path">{f.path}</span>
                  <span className="file-actions">
                    <button
                      className="icon-button"
                      title="Mark resolved"
                      onClick={(e) => {
                        e.stopPropagation()
                        conflictActions.onMarkResolved([f.path])
                      }}
                    >
                      ✓
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="detail-section">
        <div className="detail-section-header">
          <span>Unstaged ({unstaged.length})</span>
          {unstaged.length > 0 && (
            <button className="link-button" onClick={() => onStage(unstaged.map((f) => f.path))}>
              Stage All
            </button>
          )}
        </div>
        <ul className="file-list">{unstaged.map((f) => renderRow(f, false))}</ul>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">
          <span>Staged ({staged.length})</span>
          {staged.length > 0 && (
            <button className="link-button" onClick={() => onUnstage(staged.map((f) => f.path))}>
              Unstage All
            </button>
          )}
        </div>
        <ul className="file-list">{staged.map((f) => renderRow(f, true))}</ul>
      </div>

      {operation ? (
        <OperationCommitBox
          operation={operation}
          conflictCount={conflicted.length}
          stagedCount={staged.length}
          commitMessage={commitMessage}
          onCommitMessageChange={onCommitMessageChange}
          actions={conflictActions}
        />
      ) : (
        <div className="commit-box">
          <div className="commit-box-toolbar">
            <button
              className="link-button"
              title="Fill in a message from simple rules (no AI)"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setQuickMenu({ x: r.left, y: r.bottom + 4 })
              }}
            >
              Quick actions ▾
            </button>
            <button
              className="link-button"
              disabled={staged.length === 0 || generating}
              onClick={handleGenerateMessage}
            >
              {generating ? 'Generating…' : 'Generate message'}
            </button>
          </div>
          {generateError && <div className="ai-error">{generateError}</div>}
          {suggestions.length > 0 && !commitMessage.trim() && (
            <button
              className="quick-suggestion"
              title="Use this message (no AI)"
              onClick={() => onCommitMessageChange(suggestions[0].message)}
            >
              <span className="quick-suggestion-label">Use</span> {suggestions[0].message.split('\n')[0]}
            </button>
          )}
          <textarea
            placeholder={amend ? 'Amended commit message' : 'Commit message'}
            aria-label="Commit message"
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isPrimary(e.nativeEvent) && canCommit) {
                e.preventDefault()
                onCommit()
              }
            }}
          />
          <label className="amend-toggle" title="Replace the last commit with these changes and this message">
            <input type="checkbox" checked={amend} onChange={(e) => onAmendChange(e.target.checked)} />
            Amend previous commit
          </label>
          <button className="commit-button" disabled={!canCommit} onClick={onCommit} title={`${MOD}Enter`}>
            {amend ? 'Amend Commit' : 'Commit'} {staged.length > 0 ? `(${staged.length})` : ''}
          </button>
        </div>
      )}
      {quickMenu && (
        <ContextMenu
          x={quickMenu.x}
          y={quickMenu.y}
          sections={quickMenuSections()}
          onClose={() => setQuickMenu(null)}
        />
      )}
      {conflictMenu && (
        <ContextMenu
          x={conflictMenu.x}
          y={conflictMenu.y}
          sections={conflictMenuSections(conflictMenu.path)}
          onClose={() => setConflictMenu(null)}
        />
      )}
      {fileMenu && (
        <ContextMenu
          x={fileMenu.x}
          y={fileMenu.y}
          sections={fileMenuSections({
            path: fileMenu.file.path,
            deleted: (fileMenu.isStaged ? fileMenu.file.index : fileMenu.file.worktree) === 'D',
            // A newly added file has no commits to blame or list yet.
            untracked: fileMenu.file.untracked || fileMenu.file.index === 'A',
            onOpenDiff: () => onOpenFile(fileMenu.file, fileMenu.isStaged),
            onEdit: () => onEditFile(fileMenu.file.path),
            onBlame: () => onOpenFileView(fileMenu.file.path, null, 'blame'),
            onHistory: () => onOpenFileView(fileMenu.file.path, null, 'history'),
            onCopyPath: () => onCopyText(fileMenu.file.path)
          })}
          onClose={() => setFileMenu(null)}
        />
      )}
    </div>
  )
}

/** The commit area while a merge, rebase, cherry-pick or revert is stopped. */
function OperationCommitBox({
  operation,
  conflictCount,
  stagedCount,
  commitMessage,
  onCommitMessageChange,
  actions
}: {
  operation: OperationState
  conflictCount: number
  stagedCount: number
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  actions: ConflictActions
}): JSX.Element {
  const name = OPERATION_NAMES[operation.kind]
  const isRebase = operation.kind === 'rebase'
  // With nothing left to commit, a rebase or pick can only skip this commit.
  const canSkip = operation.kind !== 'merge' && stagedCount === 0 && conflictCount === 0
  const mainLabel = canSkip
    ? 'Skip Commit'
    : operation.kind === 'merge'
      ? 'Commit and Merge'
      : isRebase
        ? 'Continue Rebase'
        : `Commit ${name}`
  const blocked = conflictCount > 0
  return (
    <div className="commit-box">
      {!isRebase && (
        <textarea
          placeholder="Commit message"
          value={commitMessage}
          onChange={(e) => onCommitMessageChange(e.target.value)}
        />
      )}
      {blocked && (
        <div className="operation-hint">
          Resolve {conflictCount === 1 ? 'the conflicted file' : `all ${conflictCount} conflicted files`} to
          continue.
        </div>
      )}
      <button
        className="commit-button"
        disabled={blocked || (!canSkip && !isRebase && !commitMessage.trim())}
        onClick={canSkip ? actions.onSkip : actions.onContinue}
      >
        {mainLabel}
      </button>
      <button className="abort-button" onClick={actions.onAbort}>
        Abort {name}
      </button>
    </div>
  )
}

function CommitDetailView({
  repoPath,
  hash,
  onOpenFileDiff,
  onOpenFileView,
  onCopyText,
  activePath
}: {
  repoPath: string
  hash: string
  activePath: string | null
  onOpenFileDiff: (path: string) => void
  onOpenFileView: (path: string, ref: string | null, mode: 'history' | 'blame') => void
  onCopyText: (text: string) => void
}): JSX.Element {
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; path: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Keyed by commit, so this only ever loads one.
  useEffect(() => {
    let cancelled = false
    window.api.commitDetail(repoPath, hash).then((res) => {
      if (cancelled) return
      if (res.ok) setDetail(res.data)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash])

  if (error) return <div className="detail-panel-content">{error}</div>
  if (!detail) return <div className="detail-panel-content">Loading…</div>

  const modified = detail.files.filter((f) => f.status === 'M').length
  const added = detail.files.filter((f) => f.status === 'A').length
  const deleted = detail.files.filter((f) => f.status === 'D').length

  return (
    <div className="detail-panel-content">
      <div className="detail-header-row">
        <span>commit: {detail.hash.slice(0, 7)}</span>
      </div>
      <div className="commit-subject-large" data-testid="commit-subject">
        {detail.subject}
      </div>
      {detail.body && <div className="commit-body">{detail.body}</div>}
      <div className="commit-author-row">
        <Avatar name={detail.author} email={detail.authorEmail} hash={detail.hash} repoPath={repoPath} size={28} />
        <div>
          <div>{detail.author}</div>
          <div className="commit-meta-dim">
            {new Date(detail.date).toLocaleString()}
            {detail.parents[0] && ` · parent: ${detail.parents[0].slice(0, 7)}`}
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">
          <span>
            {modified > 0 && `${modified} modified`}
            {added > 0 && `${modified > 0 ? ', ' : ''}${added} added`}
            {deleted > 0 && `${modified + added > 0 ? ', ' : ''}${deleted} deleted`}
            {detail.files.length === 0 && 'No file changes'}
          </span>
        </div>
        <ul className="file-list">
          {detail.files.map((f) => (
            <li key={f.path}>
              <div
                className={`file-row ${activePath === f.path ? 'active' : ''}`}
                aria-current={activePath === f.path}
                onClick={() => onOpenFileDiff(f.path)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setFileMenu({ x: e.clientX, y: e.clientY, path: f.path, status: f.status[0] })
                }}
              >
                <span className={`status-code code-${f.status[0]}`}>{f.status[0]}</span>
                <span className="file-path">{f.path}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {fileMenu && (
        <ContextMenu
          x={fileMenu.x}
          y={fileMenu.y}
          sections={fileMenuSections({
            path: fileMenu.path,
            deleted: fileMenu.status === 'D',
            onOpenDiff: () => onOpenFileDiff(fileMenu.path),
            onBlame: () => onOpenFileView(fileMenu.path, hash, 'blame'),
            onHistory: () => onOpenFileView(fileMenu.path, hash, 'history'),
            onCopyPath: () => onCopyText(fileMenu.path)
          })}
          onClose={() => setFileMenu(null)}
        />
      )}
    </div>
  )
}

export interface MultiCommitActions {
  /** Picks the commits onto the current branch, oldest first. */
  cherryPick: (hashes: string[]) => void
  /** Reverts the commits, newest first. */
  revert: (hashes: string[]) => void
  copyText: (text: string) => void
  select: (hash: string) => void
}

/** The side bar when several commits are selected. `hashes` is newest first. */
function MultiCommitView({
  hashes,
  lookup,
  actions
}: {
  hashes: string[]
  lookup: (hash: string) => GraphCommit | undefined
  actions: MultiCommitActions
}): JSX.Element {
  const oldestFirst = [...hashes].reverse()
  return (
    <div className="detail-panel-content">
      <div className="detail-header-row">
        <span>{hashes.length} commits selected</span>
      </div>
      <div className="multi-commit-actions">
        <button onClick={() => actions.cherryPick(oldestFirst)}>Cherry-pick {hashes.length} commits</button>
        <button onClick={() => actions.revert(hashes)}>Revert {hashes.length} commits</button>
        <button onClick={() => actions.copyText(hashes.join('\n'))}>Copy SHAs</button>
      </div>
      <ul className="file-list multi-commit-list" aria-label="Selected commits">
        {hashes.map((hash) => {
          const commit = lookup(hash)
          return (
            <li key={hash}>
              <div className="file-row" title="Show only this commit" {...pressable(() => actions.select(hash))}>
                <span className="multi-commit-sha">{hash.slice(0, 7)}</span>
                <span className="file-path">{commit?.subject ?? ''}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface Props {
  repoPath: string
  selection: Selection
  lookupCommit: (hash: string) => GraphCommit | undefined
  multiActions: MultiCommitActions
  amend: boolean
  onAmendChange: (amend: boolean) => void
  status: RepoStatus | null
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (file: FileStatus) => void
  onCommit: () => void
  onOpenCommitFileDiff: (hash: string, path: string) => void
  operation: OperationState | null
  conflictActions: ConflictActions
  onEditFile: (path: string) => void
  onOpenFileView: (path: string, ref: string | null, mode: 'history' | 'blame') => void
  onCopyText: (text: string) => void
  onOpenWorkingFile: (file: FileStatus, staged: boolean) => void
  /** The file shown in the main area, if any, to mark in the lists. */
  activeFile: ActiveFile | null
}

export default function DetailPanel(props: Props): JSX.Element {
  if (props.selection.type === 'commits') {
    return <MultiCommitView hashes={props.selection.hashes} lookup={props.lookupCommit} actions={props.multiActions} />
  }
  if (props.selection.type === 'commit') {
    const { hash } = props.selection
    return (
      <CommitDetailView
        key={`${props.repoPath}\0${hash}`}
        repoPath={props.repoPath}
        hash={hash}
        activePath={props.activeFile?.path ?? null}
        onOpenFileDiff={(path) => props.onOpenCommitFileDiff(hash, path)}
        onOpenFileView={props.onOpenFileView}
        onCopyText={props.onCopyText}
      />
    )
  }
  return (
    <WorkingDirectoryView
      repoPath={props.repoPath}
      status={props.status}
      commitMessage={props.commitMessage}
      onCommitMessageChange={props.onCommitMessageChange}
      onStage={props.onStage}
      onUnstage={props.onUnstage}
      onDiscard={props.onDiscard}
      onCommit={props.onCommit}
      amend={props.amend}
      onAmendChange={props.onAmendChange}
      operation={props.operation}
      conflictActions={props.conflictActions}
      onEditFile={props.onEditFile}
      onOpenFileView={props.onOpenFileView}
      onCopyText={props.onCopyText}
      onOpenFile={props.onOpenWorkingFile}
      activeFile={props.activeFile}
    />
  )
}
