import { useEffect, useState, type JSX } from 'react'
import { RELEASES_URL, releaseUrl, type AppUpdateStatus } from '../../../shared/appUpdate'

interface Props {
  status: AppUpdateStatus
  onClose: () => void
}

function checkedLabel(checkedAt: number | null): string {
  if (!checkedAt) return 'Not checked yet.'
  return `Checked at ${new Date(checkedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`
}

/** Updates an installed SillyGit from GitHub Releases: download the new version, then restart into it. */
export default function AppUpdateDialog({ status, onClose }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)
  const { phase, latestVersion, currentVersion, manualReason } = status
  const busy = phase === 'checking' || phase === 'downloading' || restarting

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const run = async (call: () => Promise<{ ok: true } | { ok: false; error: string }>): Promise<boolean> => {
    setError(null)
    const res = await call()
    if (!res.ok) setError(res.error)
    return res.ok
  }

  const restart = async (): Promise<void> => {
    setRestarting(true)
    if (!(await run(window.api.installAppUpdate))) setRestarting(false)
  }

  const openPage = (url: string): void => void window.api.openExternal(url)

  let body: JSX.Element
  if (restarting) {
    body = (
      <div className="update-progress" role="status">
        <span className="update-spinner" />
        Restarting to install SillyGit {latestVersion}…
      </div>
    )
  } else if (phase === 'checking') {
    body = (
      <div className="update-progress" role="status">
        <span className="update-spinner" />
        Checking for a new version…
      </div>
    )
  } else if (phase === 'downloading') {
    const percent = Math.round(status.percent ?? 0)
    body = (
      <div className="update-download" role="status">
        <div>
          Downloading SillyGit {latestVersion}… {percent}%
        </div>
        <progress className="update-bar" max={100} value={percent} aria-label="Download progress" />
      </div>
    )
  } else if (phase === 'ready') {
    body = <div>SillyGit {latestVersion} is downloaded. Restart to finish updating, or it installs the next time you quit.</div>
  } else if (latestVersion) {
    body = (
      <div>
        SillyGit {latestVersion} is out. You have {currentVersion}.{' '}
        <button className="link-button" onClick={() => openPage(releaseUrl(latestVersion))}>
          What’s new
        </button>
      </div>
    )
  } else {
    body = <div>SillyGit {currentVersion} is the newest version.</div>
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal update-modal" role="dialog" aria-label="Update SillyGit" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Update SillyGit</span>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {body}
          {!busy && (
            <div className="modal-hint">
              {checkedLabel(status.checkedAt)}{' '}
              {manualReason ?? 'SillyGit checks GitHub for new releases when it starts and every few hours.'}
            </div>
          )}
          {status.error && !error && <div className="modal-error update-error">Last attempt failed: {status.error}</div>}
          {error && (
            <div className="modal-error update-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={() => void run(window.api.checkAppUpdate)} disabled={busy || phase === 'ready'}>
            Check again
          </button>
          {manualReason || error || status.error ? (
            <button
              className={manualReason && latestVersion ? 'commit-button' : 'subtle'}
              onClick={() => openPage(latestVersion ? releaseUrl(latestVersion) : RELEASES_URL)}
            >
              Open download page
            </button>
          ) : null}
          {!manualReason &&
            (phase === 'ready' || restarting ? (
              <button className="commit-button" onClick={() => void restart()} disabled={restarting}>
                Restart and update
              </button>
            ) : (
              <button
                className="commit-button"
                onClick={() => void run(window.api.downloadAppUpdate)}
                disabled={busy || !latestVersion}
              >
                {phase === 'downloading' ? 'Downloading…' : 'Download update'}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
