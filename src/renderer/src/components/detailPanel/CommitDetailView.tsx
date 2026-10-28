import { useEffect, useState, type JSX } from 'react'
import type { CommitDetail } from '../../../../shared/types'
import ContextMenu from '../ContextMenu'
import Avatar from '../Avatar'
import { fileMenuSections } from '../fileMenu'
import type { OpenFileView } from './types'

/** The side bar for one commit: its message, author and changed files. */
export default function CommitDetailView({
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
  onOpenFileView: OpenFileView
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
