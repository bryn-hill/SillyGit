import { useEffect, useState, type JSX } from 'react'
import type { StashEntry, StashFile } from '../../../../shared/types'
import type { StashActions } from '../Sidebar'
import { stashBranch, stashTitle } from '../../lib/stash'
import { onFileListKeyDown } from '../../lib/fileListNav'

interface Props {
  repoPath: string
  stash: StashEntry
  activePath: string | null
  /** Opens one of the stash's files full window. */
  onOpenFile: (file: StashFile) => void
  actions: StashActions
}

/** The side bar for a stash picked in the side bar: what it holds, and Apply, Pop or Delete. */
export default function StashDetailView({ repoPath, stash, activePath, onOpenFile, actions }: Props): JSX.Element {
  const [loaded, setLoaded] = useState<{ files: StashFile[] } | { error: string } | null>(null)

  // The parent keys this view by stash, so this only ever loads one.
  useEffect(() => {
    let cancelled = false
    window.api.stashFiles(repoPath, stash.hash).then((res) => {
      if (!cancelled) setLoaded(res.ok ? { files: res.data } : { error: res.error })
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, stash.hash])

  const branch = stashBranch(stash.message)
  const files = loaded && 'files' in loaded ? loaded.files : []
  const tracked = files.filter((f) => !f.untracked)
  const untracked = files.filter((f) => f.untracked)

  const renderRow = (f: StashFile): JSX.Element => (
    <li key={`${f.untracked ? 'u' : 't'}:${f.path}`}>
      <div
        className={`file-row ${activePath === f.path ? 'active' : ''}`}
        aria-current={activePath === f.path}
        tabIndex={-1}
        onClick={() => onOpenFile(f)}
      >
        <span className={`status-code code-${f.status}`}>{f.status}</span>
        <span className="file-path" title={f.origPath ? `${f.origPath} → ${f.path}` : f.path}>
          {f.path}
        </span>
      </div>
    </li>
  )

  return (
    <div className="detail-panel-content stash-detail" role="region" aria-label="Stash">
      <div className="detail-header-row">
        <span>{stash.ref}</span>
        <span className="commit-meta-dim">{stash.hash.slice(0, 7)}</span>
      </div>
      <div className="commit-subject-large" data-testid="stash-subject">
        {stashTitle(stash.message)}
      </div>
      <div className="commit-meta-dim stash-detail-meta">
        {branch ? `Stashed on ${branch} · ` : ''}
        {new Date(stash.date).toLocaleString()}
      </div>
      <div className="stash-detail-actions">
        <button onClick={() => actions.apply(stash)} title="Bring these changes back and keep the stash">
          Apply
        </button>
        <button onClick={() => actions.pop(stash)} title="Bring these changes back and delete the stash">
          Pop
        </button>
        <button className="danger" onClick={() => actions.drop(stash)} title="Delete this stash">
          Delete
        </button>
      </div>

      {!loaded ? (
        <div className="commit-meta-dim stash-detail-meta">Loading…</div>
      ) : 'error' in loaded ? (
        <div className="modal-error stash-detail-meta">{loaded.error}</div>
      ) : (
        <>
          <div className="detail-section">
            <div className="detail-section-header">
              <span>Changes ({tracked.length})</span>
            </div>
            <ul className="file-list" aria-label="Stashed changes" onKeyDown={onFileListKeyDown}>
              {tracked.map(renderRow)}
            </ul>
          </div>
          {untracked.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-header">
                <span>Untracked files ({untracked.length})</span>
              </div>
              <ul className="file-list" aria-label="Stashed untracked files" onKeyDown={onFileListKeyDown}>
                {untracked.map(renderRow)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
