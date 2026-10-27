import { useEffect, useRef, useState, type JSX } from 'react'
import type { CommitDetail } from '../../../shared/types'
import FileDiffViewer from './FileDiffViewer'
import AiResults, { idleAiRun, type AiRun } from './AiResults'
import SplitCommitPanel from './SplitCommitPanel'
import Avatar from './Avatar'

interface Props {
  repoPath: string
  hash: string
  initialPath?: string | null
  isHead: boolean
  onClose: () => void
  onNavigateToCommit: (hash: string) => void
  onWorkingTreeChanged?: () => void
  onEditFile?: (path: string) => void
}

function SparkleIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2.5 9.2 6.8 13.5 8 9.2 9.2 8 13.5 6.8 9.2 2.5 8 6.8 6.8 8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function CommitFullView({
  repoPath,
  hash,
  initialPath,
  isHead,
  onClose,
  onNavigateToCommit,
  onWorkingTreeChanged,
  onEditFile
}: Props): JSX.Element {
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [highlightTarget, setHighlightTarget] = useState<{ file: string; line?: number } | null>(
    null
  )

  const [commitAi, setCommitAi] = useState<AiRun>(idleAiRun)
  const [fileAiPath, setFileAiPath] = useState<string | null>(null)
  const [fileAi, setFileAi] = useState<AiRun>(idleAiRun)
  const currentHashRef = useRef(hash)

  useEffect(() => {
    currentHashRef.current = hash
    let cancelled = false
    setDetail(null)
    setError(null)
    setSelectedPath(null)
    setDiffText('')
    setHighlightTarget(null)
    setCommitAi(idleAiRun)
    setFileAiPath(null)
    setFileAi(idleAiRun)
    window.api.commitDetail(repoPath, hash).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setDetail(res.data)
        const initial = res.data.files.find((f) => f.path === initialPath) ?? res.data.files[0]
        if (initial) setSelectedPath(initial.path)
      } else {
        setError(res.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash])

  useEffect(() => {
    if (!selectedPath) return
    let cancelled = false
    setDiffLoading(true)
    window.api.commitFileDiff(repoPath, hash, selectedPath).then((res) => {
      if (cancelled) return
      setDiffLoading(false)
      setDiffText(res.ok ? res.data : `Unable to load diff: ${res.error}`)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash, selectedPath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const runCommitAi = async (): Promise<void> => {
    const requestHash = hash
    setCommitAi({ state: 'loading', result: null, error: null })
    const res = await window.api.aiReviewCommit(repoPath, hash)
    if (currentHashRef.current !== requestHash) return
    setCommitAi(
      res.ok
        ? { state: 'done', result: res.data, error: null }
        : { state: 'error', result: null, error: res.error }
    )
  }

  const runFileAi = async (path: string): Promise<void> => {
    const requestHash = hash
    setFileAiPath(path)
    setFileAi({ state: 'loading', result: null, error: null })
    const res = await window.api.aiReviewFile(repoPath, hash, path)
    if (currentHashRef.current !== requestHash) return
    setFileAi(
      res.ok
        ? { state: 'done', result: res.data, error: null }
        : { state: 'error', result: null, error: res.error }
    )
  }

  const handleSelectFinding = (file: string, line?: number): void => {
    setSelectedPath(file)
    setHighlightTarget({ file, line })
  }

  const modified = detail?.files.filter((f) => f.status === 'M').length ?? 0
  const added = detail?.files.filter((f) => f.status === 'A').length ?? 0
  const deleted = detail?.files.filter((f) => f.status === 'D').length ?? 0

  return (
    <div className="commit-fullview" role="region" aria-label="Commit diff">
      <div className="commit-fullview-header">
        <button className="icon-button" onClick={onClose} title="Back to repository view">
          ←
        </button>
        <span className="commit-fullview-title">
          {selectedPath ?? (detail ? detail.subject : 'Loading…')}
        </span>
        <span className="commit-fullview-hash">{hash.slice(0, 7)}</span>
        <button className="icon-button" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      {error ? (
        <div className="detail-panel-content">{error}</div>
      ) : (
        <div className="commit-fullview-body">
          <div className="commit-fullview-diff" data-testid="diff">
            {!selectedPath ? (
              <div className="commit-fullview-empty">No file changes in this commit.</div>
            ) : diffLoading ? (
              <div className="commit-fullview-empty">Loading diff…</div>
            ) : (
              <FileDiffViewer
                repoPath={repoPath}
                hash={hash}
                path={selectedPath}
                diffText={diffText}
                highlightLine={highlightTarget?.file === selectedPath ? highlightTarget.line : undefined}
                onNavigateToCommit={onNavigateToCommit}
                onWorkingTreeChanged={onWorkingTreeChanged}
                onEditFile={onEditFile}
              />
            )}
          </div>

          <div className="commit-fullview-sidebar">
            {!detail ? (
              <div className="detail-panel-content">Loading…</div>
            ) : (
              <>
                <div className="ai-section">
                  <button
                    className="ai-ask-button"
                    disabled={commitAi.state === 'loading'}
                    onClick={runCommitAi}
                  >
                    {commitAi.state === 'loading' ? 'Reviewing commit…' : 'Ask AI to review commit'}
                  </button>
                  <AiResults run={commitAi} onSelectFinding={handleSelectFinding} />
                </div>

                {isHead && (
                  <SplitCommitPanel repoPath={repoPath} hash={hash} onApplied={onClose} />
                )}

                <div className="commit-subject-large">{detail.subject}</div>
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
                          className={`file-row ${selectedPath === f.path ? 'active' : ''}`}
                          aria-current={selectedPath === f.path}
                          // Clicking the open file again closes the diff.
                          onClick={() =>
                            selectedPath === f.path ? onClose() : setSelectedPath(f.path)
                          }
                        >
                          <span className={`status-code code-${f.status[0]}`}>{f.status[0]}</span>
                          <span className="file-path">{f.path}</span>
                          <span className="file-actions">
                            <button
                              className="icon-button"
                              title="Ask AI about this file"
                              onClick={(e) => {
                                e.stopPropagation()
                                runFileAi(f.path)
                              }}
                            >
                              <SparkleIcon />
                            </button>
                          </span>
                        </div>
                        {fileAiPath === f.path && (
                          <div className="ai-inline">
                            <AiResults run={fileAi} onSelectFinding={handleSelectFinding} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
