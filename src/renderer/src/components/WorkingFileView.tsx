import { useEffect, useState, type JSX } from 'react'
import FileDiffViewer from './FileDiffViewer'
import type { DiffLanes } from '../lib/lanes'

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
  /** While lanes are on: who owns each line, and moving lines between lanes. */
  lanes?: DiffLanes | null
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
  onWorkingTreeChanged,
  lanes
}: Props): JSX.Element {
  // The last loaded diff and the file it's for. It stays up while another file's (or a refresh's) loads,
  // rather than blinking to "Loading diff…" and back.
  const [diff, setDiff] = useState<{ path: string; staged: boolean; untracked: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.diff(repoPath, path, staged, untracked).then((res) => {
      if (!cancelled) setDiff({ path, staged, untracked, text: res.ok ? res.data : `Unable to load diff: ${res.error}` })
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
        <span className="working-file-side">
          {lanes ? (untracked ? 'New file' : 'Uncommitted changes') : staged ? 'Staged changes' : untracked ? 'New file' : 'Unstaged changes'}
        </span>
        {!lanes && (
          <button
            className="working-file-stage"
            onClick={() => (staged ? onUnstage([path]) : onStage([path]))}
            title={staged ? 'Move this file out of the next commit' : 'Add this file to the next commit'}
          >
            {staged ? 'Unstage file' : 'Stage file'}
          </button>
        )}
        <button className="icon-button" onClick={onClose} title="Close" aria-label="Close file diff">
          ✕
        </button>
      </div>
      <div className="commit-fullview-diff" data-testid="diff">
        {diff == null ? (
          <div className="commit-fullview-empty">Loading diff…</div>
        ) : (
          <FileDiffViewer
            repoPath={repoPath}
            hash={null}
            staged={diff.staged}
            untracked={diff.untracked}
            path={diff.path}
            diffText={diff.text}
            onWorkingTreeChanged={onWorkingTreeChanged}
            onEditFile={onEditFile}
            onOpenFileView={onOpenFileView}
            lanes={lanes ?? undefined}
          />
        )}
      </div>
    </div>
  )
}
