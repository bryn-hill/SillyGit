import { useEffect, useState, type JSX } from 'react'
import type { LaunchpadPullRequest } from '../../../shared/types'
import {
  PR_MERGE_METHOD_LABELS,
  PR_MERGE_METHODS,
  initialMergeMethod,
  type PrMergeMethod,
  type PrMergeMethods
} from '../../../shared/mergeOptions'
import { loadPrMergeMethod, savePrMergeMethod } from '../lib/preferences'

/**
 * Asks how to merge a pull request: merge commit, squash or rebase, offering
 * only what the repository allows and starting on the method used last.
 */
export default function MergePullRequestDialog({
  pr,
  onMerged,
  onCancel
}: {
  pr: LaunchpadPullRequest
  onMerged: () => void
  onCancel: () => void
}): JSX.Element {
  const [methods, setMethods] = useState<PrMergeMethods | null>(null)
  // Null until picked, so the starting choice follows the allowed methods once they load.
  const [picked, setPicked] = useState<PrMergeMethod | null>(null)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.launchpadMergeMethods(pr.repoPath, pr.number).then((res) => {
      if (cancelled) return
      // Not knowing what's allowed still lets the user try; the host says no if it must.
      setMethods(res.ok ? res.data : { allowed: PR_MERGE_METHODS, known: false })
    })
    return () => {
      cancelled = true
    }
  }, [pr.repoPath, pr.number])

  const method = picked ?? (methods ? initialMergeMethod(methods, loadPrMergeMethod(pr.repoPath)) : null)

  const merge = async (): Promise<void> => {
    if (!method) return
    setMerging(true)
    setError(null)
    const res = await window.api.launchpadMergePr(pr.repoPath, pr.number, method)
    setMerging(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    savePrMergeMethod(pr.repoPath, method)
    onMerged()
  }

  const title = `Merge pull request #${pr.number}`
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal merge-pr-dialog" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{title}</span>
          <button className="icon-button" onClick={onCancel} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="merge-pr-summary">
            “{pr.title}”: {pr.headRefName} into {pr.baseRefName}
          </div>
          <div className="merge-pr-methods" role="radiogroup" aria-label="Merge method">
            {PR_MERGE_METHODS.map((m) => {
              const allowed = methods?.allowed.includes(m) ?? false
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  className={`merge-pr-method${method === m ? ' selected' : ''}`}
                  disabled={!allowed || merging}
                  title={methods && !allowed ? `${pr.repoName} doesn't allow this merge method.` : undefined}
                  onClick={() => setPicked(m)}
                >
                  <span className="merge-pr-method-label">{PR_MERGE_METHOD_LABELS[m].label}</span>
                  <span className="merge-pr-method-hint">{PR_MERGE_METHOD_LABELS[m].hint}</span>
                </button>
              )
            })}
          </div>
          {!methods && <div className="modal-hint">Checking what {pr.repoName} allows…</div>}
          {methods && !methods.known && (
            <div className="modal-hint">Couldn't read the repository's merge settings, so every method is offered.</div>
          )}
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onCancel}>
            Cancel
          </button>
          <button className="commit-button" disabled={!method || merging} onClick={() => void merge()}>
            {merging ? 'Merging…' : method ? PR_MERGE_METHOD_LABELS[method].label : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}
