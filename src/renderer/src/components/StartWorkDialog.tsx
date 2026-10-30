import { useEffect, useState, type JSX } from 'react'
import type { IssueWorkOptions, StartIssueWorkResult } from '../../../shared/types'
import { repoDisplayName } from '../lib/repoName'
import Select from './Select'

/** An issue to start work on: a GitHub issue in its repo, or a Jira issue that can go in any repo. */
export interface WorkItem {
  /** A GitHub issue number or a Jira key; Start work records it on the branch. */
  issue: number | string
  /** How the issue is named, e.g. "#12" or "PROJ-12". */
  label: string
  title: string
  /** The branch name offered. */
  branch: string
  /** The repo it belongs to; null to pick one of `repos`. */
  repoPath: string | null
  /** What the pull request will do with the issue, e.g. "Its pull request will close #12." */
  outcome: string
}

interface Props {
  item: WorkItem
  /** Repos to choose from when the item has none; the first is picked to begin with. */
  repos?: string[]
  onStarted: (repoPath: string, result: StartIssueWorkResult) => void
  onCancel: () => void
}

/**
 * Start work on an issue: names a branch after it and checks it out, off the
 * default branch or stacked on the branch that's checked out.
 */
export default function StartWorkDialog({ item, repos = [], onStarted, onCancel }: Props): JSX.Element {
  const suggested = item.branch
  const [repoPath, setRepoPath] = useState<string | null>(item.repoPath ?? repos[0] ?? null)
  const [name, setName] = useState(suggested)
  // The options and the repo they were read for, so another repo's never show.
  const [loaded, setLoaded] = useState<{ repoPath: string; options: IssueWorkOptions } | null>(null)
  const [stack, setStack] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repoPath) return
    let cancelled = false
    window.api.issueWorkOptions(repoPath, suggested).then((res) => {
      if (cancelled) return
      if (res.ok) setLoaded({ repoPath, options: res.data })
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, suggested])

  const options = loaded?.repoPath === repoPath ? loaded.options : null
  const resuming = !!options?.branchExists && name.trim() === suggested
  const stacking = stack && !!options?.canStack && !resuming

  const submit = async (): Promise<void> => {
    if (!name.trim() || busy || !repoPath) return
    setBusy(true)
    setError(null)
    const res = await window.api.startIssueWork(repoPath, item.issue, name.trim(), stacking)
    setBusy(false)
    if (res.ok) onStarted(repoPath, res.data)
    else setError(res.error)
  }

  const title = `Start work on ${item.label}`
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
            {item.repoPath ? `${repoDisplayName(item.repoPath)} · ` : ''}
            {item.title}
          </div>
          {!item.repoPath && (
            <>
              <label className="modal-label" htmlFor="start-work-repo">
                Repository
              </label>
              {repos.length > 0 ? (
                <Select
                  id="start-work-repo"
                  value={repoPath ?? ''}
                  options={repos.map((path) => ({ value: path, label: repoDisplayName(path), title: path }))}
                  onChange={(path) => {
                    setRepoPath(path)
                    setStack(false)
                    setError(null)
                  }}
                />
              ) : (
                <div className="modal-hint">Open a repository, or add one to Launchpad, to start work in it.</div>
              )}
            </>
          )}
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
              {item.outcome}
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
