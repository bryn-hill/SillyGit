import { useEffect, useState, type JSX } from 'react'
import type { StashEntry, StashFile } from '../../../shared/types'
import FileDiffViewer from './FileDiffViewer'

interface Props {
  repoPath: string
  stash: StashEntry
  file: StashFile
  onClose: () => void
}

/**
 * One file of a stash, full window, in place of the graph. A stash is a commit
 * whose first parent is where it was made, so a tracked file's diff is that
 * commit's; untracked files live in its third parent, which has no parent of
 * its own, so they show as added.
 */
export default function StashFileView({ repoPath, stash, file, onClose }: Props): JSX.Element {
  const rev = file.untracked ? `${stash.hash}^3` : stash.hash
  // The last loaded diff stays up while another file's loads.
  const [diff, setDiff] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.commitFileDiff(repoPath, rev, file.path, false, file.origPath).then((res) => {
      if (!cancelled) setDiff(res.ok ? res.data : `Unable to load diff: ${res.error}`)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, rev, file.path, file.origPath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="commit-fullview" role="region" aria-label="Stash diff">
      <div className="commit-fullview-header">
        <button className="icon-button" onClick={onClose} title="Back to repository view">
          ←
        </button>
        <span className="commit-fullview-title">{file.path}</span>
        <span className="commit-fullview-hash">{stash.ref}</span>
        <button className="icon-button" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <div className="commit-fullview-body">
        <div className="commit-fullview-diff" data-testid="diff">
          {!diff ? (
            <div className="commit-fullview-empty">Loading diff…</div>
          ) : (
            <FileDiffViewer
              repoPath={repoPath}
              hash={rev}
              path={file.path}
              oldPath={file.origPath}
              diffText={diff}
              readOnly
            />
          )}
        </div>
      </div>
    </div>
  )
}
