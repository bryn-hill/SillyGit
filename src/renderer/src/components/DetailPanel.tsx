import { useEffect, useState, type JSX } from 'react'
import type { CommitDetail, FileStatus, OperationState, RepoStatus } from '../../../shared/types'
import type { Selection } from '../App'
import DiffBlock from './DiffBlock'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

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
  operation: OperationState | null
  conflictActions: ConflictActions
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
  operation,
  conflictActions
}: WorkingProps): JSX.Element {
  const [conflictMenu, setConflictMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const staged = status?.staged ?? []
  const unstaged = status?.unstaged ?? []
  const conflicted = status?.conflicted ?? []
  const totalChanges = staged.length + unstaged.length + conflicted.length

  const handleGenerateMessage = async (): Promise<void> => {
    setGenerating(true)
    setGenerateError(null)
    const res = await window.api.aiGenerateCommitMessage(repoPath)
    setGenerating(false)
    if (res.ok) onCommitMessageChange(res.data)
    else setGenerateError(res.error)
  }

  const toggleExpand = async (file: FileStatus, isStaged: boolean): Promise<void> => {
    const key = `${isStaged ? 's' : 'u'}:${file.path}`
    if (expanded === key) {
      setExpanded(null)
      return
    }
    setExpanded(key)
    const res = await window.api.diff(repoPath, file.path, isStaged, file.untracked)
    setDiffText(res.ok ? res.data : `Unable to load diff: ${res.error}`)
  }

  const renderRow = (file: FileStatus, isStaged: boolean): JSX.Element => {
    const key = `${isStaged ? 's' : 'u'}:${file.path}`
    return (
      <li key={key}>
        <div className="file-row" onClick={() => toggleExpand(file, isStaged)}>
          <span className={`status-code code-${statusLabel(file.index !== '.' && isStaged ? file.index : file.worktree)}`}>
            {statusLabel(file.index !== '.' && isStaged ? file.index : file.worktree)}
          </span>
          <span className="file-path">{file.path}</span>
          <span className="file-actions">
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
        {expanded === key && (
          <div className="inline-diff">
            <DiffBlock diffText={diffText} />
          </div>
        )}
      </li>
    )
  }

  const conflictMenuSections = (path: string): ContextMenuItem[][] => [
    [{ id: 'open', label: 'Open in merge tool', onSelect: () => conflictActions.onOpenConflict(path) }],
    [
      {
        id: 'take-current',
        label: `Take current (${operation?.currentLabel ?? 'current'})`,
        onSelect: () => conflictActions.onTakeSide([path], 'current')
      },
      {
        id: 'take-incoming',
        label: `Take incoming (${operation?.incomingLabel ?? 'incoming'})`,
        onSelect: () => conflictActions.onTakeSide([path], 'incoming')
      }
    ],
    [{ id: 'resolve', label: 'Mark resolved', onSelect: () => conflictActions.onMarkResolved([path]) }]
  ]

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
              onClick={() => conflictActions.onMarkResolved(conflicted.map((f) => f.path))}
            >
              Mark All Resolved
            </button>
          </div>
          <ul className="file-list">
            {conflicted.map((f) => (
              <li key={`c:${f.path}`}>
                <div
                  className={`file-row conflict-row ${conflictMenu?.path === f.path ? 'context-target' : ''}`}
                  onClick={() => conflictActions.onOpenConflict(f.path)}
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
              disabled={staged.length === 0 || generating}
              onClick={handleGenerateMessage}
            >
              {generating ? 'Generating…' : 'Generate message'}
            </button>
          </div>
          {generateError && <div className="ai-error">{generateError}</div>}
          <textarea
            placeholder="Commit message"
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
          />
          <button
            className="commit-button"
            disabled={!commitMessage.trim() || staged.length === 0}
            onClick={onCommit}
          >
            Commit {staged.length > 0 ? `(${staged.length})` : ''}
          </button>
        </div>
      )}
      {conflictMenu && (
        <ContextMenu
          x={conflictMenu.x}
          y={conflictMenu.y}
          sections={conflictMenuSections(conflictMenu.path)}
          onClose={() => setConflictMenu(null)}
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
  onOpenFileDiff
}: {
  repoPath: string
  hash: string
  onOpenFileDiff: (path: string) => void
}): JSX.Element {
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(null)
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
        <div className="author-avatar">{detail.author.slice(0, 1).toUpperCase()}</div>
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
              <div className="file-row" onClick={() => onOpenFileDiff(f.path)}>
                <span className={`status-code code-${f.status[0]}`}>{f.status[0]}</span>
                <span className="file-path">{f.path}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

interface Props {
  repoPath: string
  selection: Selection
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
}

export default function DetailPanel(props: Props): JSX.Element {
  if (props.selection.type === 'commit') {
    const { hash } = props.selection
    return (
      <CommitDetailView
        repoPath={props.repoPath}
        hash={hash}
        onOpenFileDiff={(path) => props.onOpenCommitFileDiff(hash, path)}
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
      operation={props.operation}
      conflictActions={props.conflictActions}
    />
  )
}
