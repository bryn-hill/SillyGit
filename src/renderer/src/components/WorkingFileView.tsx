import { useEffect, useState, type JSX } from 'react'
import FileDiffViewer from './FileDiffViewer'

interface Props {
  repoPath: string
  path: string
  /** Whether this is the staged side of the file's changes rather than the unstaged one. */
  staged: boolean
  untracked: boolean
  /** Changes whenever the working tree does, so the diff reloads. */
  refreshKey: unknown
  onClose: () => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onEditFile?: (path: string) => void
  onOpenFileView?: (path: string, ref: string | null, mode: 'history' | 'blame') => void
  onWorkingTreeChanged?: () => void
}

/**
 * An uncommitted file's diff in place of the graph, like a commit's full view, while the
 * working changes stay listed beside it to pick another file.
 */
export default function WorkingFileView({
  repoPath,
  path,
  staged,
  untracked,
  refreshKey,
  onClose,
  onStage,
  onUnstage,
  onEditFile,
  onOpenFileView,
  onWorkingTreeChanged
}: Props): JSX.Element {
  const [diffText, setDiffText] = useState<string | null>(null)

  useEffect(() => {
    setDiffText(null)
  }, [repoPath, path, staged])

  useEffect(() => {
    let cancelled = false
    window.api.diff(repoPath, path, staged, untracked).then((res) => {
      if (!cancelled) setDiffText(res.ok ? res.data : `Unable to load diff: ${res.error}`)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, path, staged, untracked, refreshKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="commit-fullview working-file-view" role="region" aria-label="Working file diff">
      <div className="commit-fullview-header">
        <button className="icon-button" onClick={onClose} title="Back to repository view">
          ←
        </button>
        <span className="commit-fullview-title" title={path}>
          {path}
        </span>
        <span className="working-file-side">{staged ? 'Staged changes' : untracked ? 'New file' : 'Unstaged changes'}</span>
        <button
          className="working-file-stage"
          onClick={() => (staged ? onUnstage([path]) : onStage([path]))}
          title={staged ? 'Move this file out of the next commit' : 'Add this file to the next commit'}
        >
          {staged ? 'Unstage file' : 'Stage file'}
        </button>
        <button className="icon-button" onClick={onClose} title="Close" aria-label="Close file diff">
          ✕
        </button>
      </div>
      <div className="commit-fullview-diff" data-testid="diff">
        {diffText == null ? (
          <div className="commit-fullview-empty">Loading diff…</div>
        ) : (
          <FileDiffViewer
            repoPath={repoPath}
            hash={null}
            staged={staged}
            untracked={untracked}
            path={path}
            diffText={diffText}
            onWorkingTreeChanged={onWorkingTreeChanged}
            onEditFile={onEditFile}
            onOpenFileView={onOpenFileView}
          />
        )}
      </div>
    </div>
  )
}
