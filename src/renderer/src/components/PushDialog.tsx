import { useId, useState, type JSX } from 'react'
import type { PushOptions } from '../../../shared/push'
import Select from './Select'

interface Props {
  /** The checked-out branch being pushed. */
  branch: string
  remotes: string[]
  /** Where a plain Push would go, which the dialog starts on. */
  initial: { remote: string; branch: string }
  onPush: (options: PushOptions) => void
  onCancel: () => void
}

/** Push to a remote and branch of your choosing, optionally as a force push with lease. */
export default function PushDialog({ branch, remotes, initial, onPush, onCancel }: Props): JSX.Element {
  const ids = useId()
  const [remote, setRemote] = useState(initial.remote)
  const [target, setTarget] = useState(initial.branch)
  const [force, setForce] = useState(false)
  const problem = target.trim() ? null : 'Name the branch to push to.'
  const submit = (): void => {
    if (!problem) onPush({ remote, branch: target.trim(), force })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal push-modal" role="dialog" aria-label="Push to" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Push {branch} to…</span>
          <button className="icon-button" onClick={onCancel} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="push-grid">
            <div className="push-field">
              <label className="modal-label" htmlFor={`${ids}-remote`}>
                Remote
              </label>
              <Select
                id={`${ids}-remote`}
                value={remote}
                options={remotes.map((name) => ({ value: name, label: name }))}
                onChange={setRemote}
              />
            </div>
            <div className="push-field">
              <label className="modal-label" htmlFor={`${ids}-branch`}>
                Branch on the remote
              </label>
              <input
                id={`${ids}-branch`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                  else if (e.key === 'Escape') onCancel()
                }}
                autoFocus
              />
            </div>
          </div>
          <label className="push-force">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Force push (with lease)
          </label>
          <div className="modal-hint">
            {force
              ? `Replaces ${remote}/${target.trim() || '…'} with ${branch}, but stops if anyone pushed there since your branch last caught up with it.`
              : 'A branch that isn’t pushed yet starts tracking the branch you push it to.'}
          </div>
          {problem && <div className="modal-error">{problem}</div>}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onCancel}>
            Cancel
          </button>
          <button className="commit-button" disabled={!!problem} onClick={submit}>
            {force ? 'Force push' : 'Push'}
          </button>
        </div>
      </div>
    </div>
  )
}
