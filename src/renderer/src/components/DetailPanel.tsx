import { useEffect, useState } from 'react'
import type { CommitDetail, FileStatus, RepoStatus } from '../../../shared/types'
import type { Selection } from '../App'
import DiffBlock from './DiffBlock'

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
}

function WorkingDirectoryView({
  repoPath,
  status,
  commitMessage,
  onCommitMessageChange,
  onStage,
  onUnstage,
  onDiscard,
  onCommit
}: WorkingProps): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const staged = status?.staged ?? []
  const unstaged = status?.unstaged ?? []
  const totalChanges = staged.length + unstaged.length

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

  return (
    <div className="detail-panel-content">
      <div className="detail-header-row">
        <span>{totalChanges} file change{totalChanges === 1 ? '' : 's'} in working directory</span>
      </div>

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

      <div className="commit-box">
        <div className="commit-box-toolbar">
          <button
            className="link-button"
            disabled={staged.length === 0 || generating}
            onClick={handleGenerateMessage}
          >
            {generating ? 'Generating…' : '✨ Generate message'}
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
    </div>
  )
}

function CommitDetailView({ repoPath, hash }: { repoPath: string; hash: string }): JSX.Element {
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(null)
    setExpanded(null)
    window.api.commitDetail(repoPath, hash).then((res) => {
      if (cancelled) return
      if (res.ok) setDetail(res.data)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash])

  const toggleExpand = async (path: string): Promise<void> => {
    if (expanded === path) {
      setExpanded(null)
      return
    }
    setExpanded(path)
    const res = await window.api.commitFileDiff(repoPath, hash, path)
    setDiffText(res.ok ? res.data : `Unable to load diff: ${res.error}`)
  }

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
      <div className="commit-subject-large">{detail.subject}</div>
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
              <div className="file-row" onClick={() => toggleExpand(f.path)}>
                <span className={`status-code code-${f.status[0]}`}>{f.status[0]}</span>
                <span className="file-path">{f.path}</span>
              </div>
              {expanded === f.path && (
                <div className="inline-diff">
                  <DiffBlock diffText={diffText} />
                </div>
              )}
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
}

export default function DetailPanel(props: Props): JSX.Element {
  if (props.selection.type === 'commit') {
    return <CommitDetailView repoPath={props.repoPath} hash={props.selection.hash} />
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
    />
  )
}
