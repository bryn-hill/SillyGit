import { useEffect, useState, type JSX } from 'react'
import { STEP_LABELS, UPDATE_BRANCH, type SelfUpdateStatus, type SelfUpdateStep } from '../../../shared/selfUpdate'

interface Props {
  status: SelfUpdateStatus
  /** The update step running, if any. */
  step: SelfUpdateStep | null
  onClose: () => void
}

function checkedLabel(checkedAt: number | null): string {
  if (!checkedAt) return 'Not checked yet.'
  return `Checked at ${new Date(checkedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`
}

/** Pulls the latest main into the checkout SillyGit runs from, then rebuilds and restarts it. */
export default function UpdateDialog({ status, step, onClose }: Props): JSX.Element {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const updating = step !== null

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !updating) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, updating])

  const check = async (): Promise<void> => {
    setChecking(true)
    setError(null)
    setNotice(null)
    const res = await window.api.checkSelfUpdate()
    setChecking(false)
    if (!res.ok) setError(res.error)
  }

  const update = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    const res = await window.api.applySelfUpdate()
    if (!res.ok) {
      setError(res.error)
      return
    }
    if (!res.data.updated) setNotice('SillyGit is already up to date.')
    else if (res.data.stashedChanges) {
      setNotice(
        `Your uncommitted changes in SillyGit's checkout clash with the update, so they were left in ${res.data.stashedChanges}. Pop it there when you're ready.`
      )
    }
  }

  const { behind, incoming, blocked, dirty } = status
  const more = behind - incoming.length

  return (
    <div className="modal-backdrop" onClick={() => !updating && onClose()}>
      <div className="modal update-modal" role="dialog" aria-label="Update SillyGit" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Update SillyGit</span>
          <button className="icon-button" onClick={onClose} disabled={updating} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {step ? (
            <div className="update-progress" role="status">
              <span className="update-spinner" />
              {STEP_LABELS[step]}
            </div>
          ) : behind > 0 ? (
            <>
              <div>
                {behind} new commit{behind === 1 ? '' : 's'} on {UPDATE_BRANCH}:
              </div>
              <ul className="update-commits" aria-label="Incoming commits">
                {incoming.map((c) => (
                  <li key={c.hash}>
                    <code>{c.hash}</code> {c.subject}
                  </li>
                ))}
                {more > 0 && <li className="update-more">…and {more} more</li>}
              </ul>
            </>
          ) : (
            <div>SillyGit is up to date with {UPDATE_BRANCH}.</div>
          )}
          {!step && (
            <div className="modal-hint">
              {checkedLabel(status.checkedAt)} Updating pulls origin/{UPDATE_BRANCH} into <code>{status.root}</code>, runs npm
              install when the dependencies changed, rebuilds and restarts SillyGit.
              {dirty && !blocked && ' Uncommitted changes there are stashed and put back afterwards.'}
            </div>
          )}
          {blocked && <div className="modal-error">{blocked}</div>}
          {status.error && !error && <div className="modal-error">Last check failed: {status.error}</div>}
          {error && (
            <div className="modal-error update-error" role="alert">
              {error}
            </div>
          )}
          {notice && <div className="modal-saved">{notice}</div>}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={() => void check()} disabled={checking || updating}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
          <button
            className="commit-button"
            onClick={() => void update()}
            disabled={updating || checking || behind === 0 || !!blocked}
          >
            Update and restart
          </button>
        </div>
      </div>
    </div>
  )
}
