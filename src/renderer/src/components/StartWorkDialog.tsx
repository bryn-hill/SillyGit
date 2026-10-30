import { useEffect, useState, type JSX } from 'react'
import type { IssueWorkOptions, LaunchpadIssue, StartIssueWorkResult } from '../../../shared/types'
import { issueBranchName } from '../../../shared/issues'

interface Props {
  issue: LaunchpadIssue
  onStarted: (result: StartIssueWorkResult) => void
  onCancel: () => void
}

/**
 * Start work on an issue: names a branch after it and checks it out, off the
 * default branch or stacked on the branch that's checked out.
 */
export default function StartWorkDialog({ issue, onStarted, onCancel }: Props): JSX.Element {
  const suggested = issueBranchName(issue.number, issue.title)
  const [name, setName] = useState(suggested)
  const [options, setOptions] = useState<IssueWorkOptions | null>(null)
  const [stack, setStack] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.issueWorkOptions(issue.repoPath, suggested).then((res) => {
      if (cancelled) return
      if (res.ok) setOptions(res.data)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [issue.repoPath, suggested])

  const resuming = !!options?.branchExists && name.trim() === suggested
  const stacking = stack && !!options?.canStack && !resuming

  const submit = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    const res = await window.api.startIssueWork(issue.repoPath, issue.number, name.trim(), stacking)
    setBusy(false)
    if (res.ok) onStarted(res.data)
    else setError(res.error)
  }

  const title = `Start work on #${issue.number}`
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal start-work" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{title}</span>
          <button className="icon-button" onClick={onCancel} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="start-work-issue">
            {issue.repoName} · {issue.title}
          </div>
          <label className="modal-label" htmlFor="start-work-branch">
            Branch name
          </label>
          <input
            id="start-work-branch"
            autoFocus
            value={name}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              else if (e.key === 'Escape') onCancel()
            }}
          />
          {options?.canStack && !resuming && (
            <label className="settings-checkbox">
              <input type="checkbox" checked={stack} onChange={(e) => setStack(e.target.checked)} />
              Stack on {options.currentBranch}
            </label>
          )}
          {options && (
            <div className="modal-hint">
              {resuming
                ? `${suggested} already exists, so it will be checked out.`
                : stacking
                  ? `Branches from ${options.currentBranch} and restacks with it.`
                  : `Branches from ${options.base}.`}{' '}
              Its pull request will close #{issue.number}.
            </div>
          )}
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onCancel}>
            Cancel
          </button>
          <button className="commit-button" disabled={!name.trim() || busy || !options} onClick={() => void submit()}>
            {busy ? 'Starting…' : resuming ? 'Check out' : 'Start work'}
          </button>
        </div>
      </div>
    </div>
  )
}
