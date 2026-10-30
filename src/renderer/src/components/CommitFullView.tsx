import { useEffect, useEffectEvent, useState, type JSX } from 'react'
import type { CommitDetail } from '../../../shared/types'
import FileDiffViewer from './FileDiffViewer'
import TreeFileView from './TreeFileView'

interface Props {
  repoPath: string
  hash: string
  /** The file to show; null picks the commit's first file. The file list is the detail panel beside this view. */
  path: string | null
  /** A line to scroll to, from an AI review finding. */
  highlightLine?: number
  /** Called with the file picked when this opened without one. */
  onPathChange: (path: string) => void
  onClose: () => void
  onNavigateToCommit: (hash: string) => void
  onWorkingTreeChanged?: () => void
  onEditFile?: (path: string) => void
  onOpenFileView?: (path: string, ref: string | null, mode: 'history' | 'blame') => void
}

/** One file of a commit, full window, in place of the graph: its diff, or the file as it was if the commit didn't change it. */
export default function CommitFullView({
  repoPath,
  hash,
  path,
  highlightLine,
  onPathChange,
  onClose,
  onNavigateToCommit,
  onWorkingTreeChanged,
  onEditFile,
  onOpenFileView
}: Props): JSX.Element {
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The last loaded diff and the file it's for. It stays up while another file's loads, rather than blinking
  // to "Loading diff…" and back.
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)

  const pickFirstFile = useEffectEvent((files: CommitDetail['files']) => {
    if (!path && files[0]) onPathChange(files[0].path)
  })

  // The parent keys this view by commit, so this only ever loads one.
  useEffect(() => {
    let cancelled = false
    window.api.commitDetail(repoPath, hash).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setDetail(res.data)
        pickFirstFile(res.data.files)
      } else {
        setError(res.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash])

  // A file from the commit's Files tab that the commit didn't change has no diff, so it shows as it was.
  const unchanged = !!(detail && path && !detail.files.some((f) => f.path === path))

  useEffect(() => {
    if (!path) return
    let cancelled = false
    window.api.commitFileDiff(repoPath, hash, path).then((res) => {
      if (cancelled) return
      setDiff({ path, text: res.ok ? res.data : `Unable to load diff: ${res.error}` })
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash, path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="commit-fullview" role="region" aria-label="Commit diff">
      <div className="commit-fullview-header">
        <button className="icon-button" onClick={onClose} title="Back to repository view">
          ←
        </button>
        <span className="commit-fullview-title">{path ?? (detail ? detail.subject : 'Loading…')}</span>
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
            {unchanged && path ? (
              <TreeFileView repoPath={repoPath} hash={hash} path={path} onOpenFileView={onOpenFileView} />
            ) : detail && detail.files.length === 0 ? (
              <div className="commit-fullview-empty">No file changes in this commit.</div>
            ) : !diff ? (
              <div className="commit-fullview-empty">Loading diff…</div>
            ) : (
              <FileDiffViewer
                repoPath={repoPath}
                hash={hash}
                path={diff.path}
                diffText={diff.text}
                highlightLine={diff.path === path ? highlightLine : undefined}
                onNavigateToCommit={onNavigateToCommit}
                onWorkingTreeChanged={onWorkingTreeChanged}
                onEditFile={onEditFile}
                onOpenFileView={onOpenFileView}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
