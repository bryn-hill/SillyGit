import { useEffect, useState, type JSX } from 'react'
import type { ActivityEntry } from '../../../shared/activity'
import type { BranchInfo } from '../../../shared/types'
import type { ActivityTab } from '../hooks/useDialogs'
import { repoDisplayName } from '../lib/repoName'
import ReflogView, { type ReflogActions } from './ReflogView'

interface Props {
  /** Only this repo's commands are shown, or every repo's when null. */
  repoPath: string | null
  tab: ActivityTab
  onTab: (tab: ActivityTab) => void
  branches: BranchInfo[]
  refreshKey: unknown
  reflogActions: ReflogActions
  onClose: () => void
}

const POLL_MS = 1500

function formatTime(time: number): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * The git commands SillyGit has run this session that changed something,
 * newest first, and a Reflog tab for where HEAD and branches have been.
 */
export default function ActivityLog({
  repoPath,
  tab,
  onTab,
  branches,
  refreshKey,
  reflogActions,
  onClose
}: Props): JSX.Element {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null)
  const [allRepos, setAllRepos] = useState(false)

  useEffect(() => {
    let live = true
    const load = async (): Promise<void> => {
      const log = await window.api.activityLog()
      if (live) setEntries(log)
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const shown = entries?.filter((e) => allRepos || !repoPath || e.repoPath === repoPath) ?? []

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal activity-modal" role="dialog" aria-label="Activity log" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Activity log</span>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        {repoPath && (
          <div className="pr-tabs activity-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'commands'} className={tab === 'commands' ? 'active' : ''} onClick={() => onTab('commands')}>
              Commands
            </button>
            <button role="tab" aria-selected={tab === 'reflog'} className={tab === 'reflog' ? 'active' : ''} onClick={() => onTab('reflog')}>
              Reflog
            </button>
          </div>
        )}
        <div className="modal-body">
          {repoPath && tab === 'reflog' ? (
            <ReflogView repoPath={repoPath} branches={branches} refreshKey={refreshKey} actions={reflogActions} onShown={onClose} />
          ) : (
            <>
              <div className="activity-toolbar">
                <span className="modal-hint">Git commands SillyGit ran since it started. Reads like status and log are left out.</span>
                {repoPath && (
                  <label className="settings-checkbox">
                    <input type="checkbox" checked={allRepos} onChange={(e) => setAllRepos(e.target.checked)} />
                    All repositories
                  </label>
                )}
              </div>
              <ul className="activity-list">
                {entries && shown.length === 0 && <li className="activity-empty">Nothing yet.</li>}
                {shown.map((entry) => (
                  <li key={entry.id} className={`activity-entry ${entry.ok ? '' : 'failed'}`}>
                    <span className="activity-time">{formatTime(entry.time)}</span>
                    <span className={`activity-status ${entry.ok ? 'ok' : 'failed'}`} aria-label={entry.ok ? 'Succeeded' : 'Failed'}>
                      {entry.ok ? '✓' : '✕'}
                    </span>
                    <div className="activity-main">
                      <code className="activity-command">{entry.command}</code>
                      {entry.error && <div className="activity-error">{entry.error}</div>}
                    </div>
                    <span className="activity-meta">
                      {(allRepos || !repoPath) && <span className="activity-repo">{repoDisplayName(entry.repoPath)}</span>}
                      {entry.durationMs} ms
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
