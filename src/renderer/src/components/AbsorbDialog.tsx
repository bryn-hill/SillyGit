import { useEffect, useState, type JSX } from 'react'
import type { AbsorbPlan } from '../../../shared/absorb'
import Select, { type SelectOption } from './Select'

interface Props {
  repoPath: string
  onAbsorb: (planHead: string, planDiff: string, assignments: Record<string, string>) => void
  onClose: () => void
}

/** Value of the "leave it staged" choice; commit hashes are never empty. */
const LEAVE = ''

/**
 * Shows which unpushed commit each staged hunk would be folded into, worked
 * out from who last changed its lines, lets the user change any of them, and
 * absorbs them in one go.
 */
export default function AbsorbDialog({ repoPath, onAbsorb, onClose }: Props): JSX.Element {
  const [loaded, setLoaded] = useState<{ plan: AbsorbPlan } | { error: string } | null>(null)
  // The user's changes to the suggested commits, by hunk.
  const [picked, setPicked] = useState<Record<string, string>>({})

  useEffect(() => {
    let current = true
    window.api.planAbsorb(repoPath).then((res) => {
      if (current) setLoaded(res.ok ? { plan: res.data } : { error: res.error })
    })
    return () => {
      current = false
    }
  }, [repoPath])

  const plan = loaded && 'plan' in loaded ? loaded.plan : null
  const targetOf = (unitId: string, suggested: string | null): string => picked[unitId] ?? suggested ?? LEAVE
  const assignments: Record<string, string> = {}
  for (const h of plan?.hunks ?? []) {
    const target = targetOf(h.unitId, h.target)
    if (target !== LEAVE) assignments[h.unitId] = target
  }
  const commitCount = new Set(Object.values(assignments)).size
  const hunkCount = Object.keys(assignments).length

  const options: SelectOption<string>[] = [
    { value: LEAVE, label: 'Leave staged' },
    ...(plan?.candidates ?? []).map((c) => ({ value: c.hash, label: `${c.shortHash} ${c.subject}`, title: c.subject }))
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal absorb-modal"
        role="dialog"
        aria-label="Absorb staged changes"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="modal-header">
          <span>
            Absorb staged changes
            <div className="cleanup-subtitle">
              Each change goes into the unpushed commit that last touched its lines.
            </div>
          </span>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        {!loaded ? (
          <div className="cleanup-empty">Working out where each change belongs…</div>
        ) : 'error' in loaded ? (
          <>
            <div className="cleanup-empty modal-error">{loaded.error}</div>
            <div className="modal-footer">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              {loaded.plan.candidates.length === 0 && (
                <div className="modal-hint">
                  Every commit on {loaded.plan.branch} is already pushed, so there is nothing to absorb into.
                </div>
              )}
              <ul className="absorb-list" aria-label="Staged changes">
                {loaded.plan.hunks.map((h) => (
                  <li key={h.unitId} className="absorb-row">
                    <div className="absorb-row-change">
                      <span className="absorb-file" title={h.file}>
                        {h.file}
                      </span>
                      <span className="absorb-counts">
                        {h.added > 0 && <span className="absorb-added">+{h.added}</span>}
                        {h.removed > 0 && <span className="absorb-removed">−{h.removed}</span>}
                      </span>
                      <span className="absorb-hunk">{h.header.replace(/^@@ [^@]* @@ ?/, '') || h.header}</span>
                    </div>
                    <div className="absorb-row-target">
                      <Select
                        value={targetOf(h.unitId, h.target)}
                        options={options}
                        onChange={(v) => setPicked((p) => ({ ...p, [h.unitId]: v }))}
                        aria-label={`Commit for ${h.file} ${h.header}`}
                        disabled={h.header === ''}
                      />
                      {!h.target && h.reason && picked[h.unitId] == null && (
                        <span className="absorb-reason">{h.reason}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="modal-footer">
              <span className="cleanup-footer-note">Changes left staged stay uncommitted.</span>
              <button className="subtle" onClick={onClose}>
                Cancel
              </button>
              <button
                className="commit-button"
                disabled={hunkCount === 0}
                onClick={() => onAbsorb(loaded.plan.head, loaded.plan.diffText, assignments)}
              >
                Absorb into {commitCount} {commitCount === 1 ? 'commit' : 'commits'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
