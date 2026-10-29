import { useEffect, useState, type JSX } from 'react'
import {
  groupCandidates,
  preselected,
  shortBranch,
  type CleanupCandidate,
  type CleanupGroup
} from '../../../shared/branchCleanup'
import { formatAge, type BranchListSettings } from '../../../shared/branchStatus'

interface Props {
  repoPath: string
  /** Starred branches are never offered. */
  favourites: string[]
  settings: BranchListSettings
  /** "Now" in ms, to age branches against without reading the clock while rendering. */
  nowMs: number
  onDelete: (names: string[]) => void
  onClose: () => void
}

function pluralBranches(n: number): string {
  return `${n} branch${n === 1 ? '' : 'es'}`
}

/** What the row's right-hand note says, and whether it warns about unpushed work. */
function rowNote(c: CleanupCandidate, nowMs: number): { text: string; warn: boolean } {
  const age = ago(c.lastCommitAt, nowMs)
  const warn = c.localOnly > 0 && !c.mergedInto
  const parts = [
    warn ? `${c.localOnly} unpushed` : c.mergedInto && `merged into ${shortBranch(c.mergedInto)}`,
    age
  ]
  return { text: parts.filter(Boolean).join(' · '), warn }
}

function ago(unixSeconds: number | undefined, nowMs: number): string | null {
  if (unixSeconds === undefined) return null
  const seconds = nowMs / 1000 - unixSeconds
  return seconds < 24 * 60 * 60 ? 'today' : `${formatAge(seconds)} ago`
}

/** The hover card on a merged branch's note: which branch, and the commit it landed in. */
function MergedCard({ c, nowMs, at }: { c: CleanupCandidate; nowMs: number; at: DOMRect }): JSX.Element {
  const via = c.mergedVia
  return (
    <div
      className="cleanup-merged-card"
      role="tooltip"
      id={`cleanup-merged-${c.name}`}
      style={{ top: at.bottom + 6, right: window.innerWidth - at.right }}
    >
      <div className="cleanup-merged-title">
        {via?.fastForward ? 'Fast-forwarded into ' : 'Merged into '}
        <strong>{c.mergedInto}</strong>
        {via?.pr !== undefined && <span className="cleanup-merged-pr">#{via.pr}</span>}
      </div>
      {via ? (
        <>
          <div className="cleanup-merged-subject">{via.subject}</div>
          <div className="cleanup-merged-meta">
            {via.hash.slice(0, 7)} · {ago(via.at, nowMs)}
          </div>
        </>
      ) : (
        <div className="cleanup-merged-meta">Every commit on {c.name} is already on it.</div>
      )}
    </div>
  )
}

function CleanupList({
  groups,
  nowMs,
  onDelete,
  onClose
}: {
  groups: CleanupGroup[]
  nowMs: number
  onDelete: (names: string[]) => void
  onClose: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState<{ name: string; rect: DOMRect } | null>(null)
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(groups.flatMap((g) => g.candidates.filter(preselected).map((c) => c.name)))
  )

  const toggle = (name: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const setGroup = (group: CleanupGroup, on: boolean): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const c of group.candidates) {
        if (on) next.add(c.name)
        else next.delete(c.name)
      }
      return next
    })
  }

  const names = groups.flatMap((g) => g.candidates.map((c) => c.name)).filter((n) => checked.has(n))

  return (
    <>
      <div className="modal-body" onScroll={() => setHovered(null)}>
        {groups.map((group) => {
          const allOn = group.candidates.every((c) => checked.has(c.name))
          return (
            <section key={group.id} aria-label={group.title} data-testid={`cleanup-group-${group.id}`}>
              <div className="cleanup-group-header">
                {group.title} · {group.candidates.length}
                <button className="link-button cleanup-group-toggle" onClick={() => setGroup(group, !allOn)}>
                  {allOn ? 'Select none' : 'Select all'}
                </button>
              </div>
              {group.candidates.map((c) => {
                const note = rowNote(c, nowMs)
                const showMerged = !note.warn && c.mergedInto !== null
                const cardOpen = showMerged && hovered?.name === c.name
                return (
                  <label key={c.name} className="cleanup-row">
                    <input type="checkbox" checked={checked.has(c.name)} onChange={() => toggle(c.name)} />
                    <span className="cleanup-row-name" title={c.name}>
                      {c.name}
                    </span>
                    {note.text && (
                      <span
                        className={`cleanup-row-why${note.warn ? ' warn' : ''}${showMerged ? ' merged' : ''}`}
                        title={
                          note.warn
                            ? `${c.localOnly} commit${c.localOnly === 1 ? ' is' : 's are'} on no remote branch. If it was squash-merged, that's expected.`
                            : undefined
                        }
                        aria-describedby={cardOpen ? `cleanup-merged-${c.name}` : undefined}
                        onMouseEnter={
                          showMerged
                            ? (e) => setHovered({ name: c.name, rect: e.currentTarget.getBoundingClientRect() })
                            : undefined
                        }
                        onMouseLeave={showMerged ? () => setHovered(null) : undefined}
                      >
                        {note.text}
                      </span>
                    )}
                    {cardOpen && hovered && <MergedCard c={c} nowMs={nowMs} at={hovered.rect} />}
                  </label>
                )
              })}
            </section>
          )
        })}
      </div>
      <div className="modal-footer">
        <span className="cleanup-footer-note">You can restore them afterwards.</span>
        <button className="subtle" onClick={onClose}>
          Cancel
        </button>
        <button className="danger-button" disabled={names.length === 0} onClick={() => onDelete(names)}>
          Delete {pluralBranches(names.length)}
        </button>
      </div>
    </>
  )
}

/**
 * Offers local branches that look finished (deleted on the remote, merged, or
 * stale) for deleting in one go. Never lists the current branch or favourites.
 */
export default function BranchCleanupDialog({
  repoPath,
  favourites,
  settings,
  nowMs,
  onDelete,
  onClose
}: Props): JSX.Element {
  const [loaded, setLoaded] = useState<{ candidates: CleanupCandidate[] } | { error: string } | null>(null)

  useEffect(() => {
    let current = true
    window.api.cleanupCandidates(repoPath).then((res) => {
      if (current) setLoaded(res.ok ? { candidates: res.data } : { error: res.error })
    })
    return () => {
      current = false
    }
  }, [repoPath])

  const groups =
    loaded && 'candidates' in loaded
      ? groupCandidates(
          loaded.candidates.filter((c) => !favourites.includes(c.name)),
          nowMs,
          settings
        )
      : []

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal cleanup-modal"
        role="dialog"
        aria-label="Clean up branches"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="modal-header">
          <span>
            Clean up branches
            <div className="cleanup-subtitle">Local branches only. Nothing on the remote is touched.</div>
          </span>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        {!loaded ? (
          <div className="cleanup-empty">Looking for branches…</div>
        ) : 'error' in loaded ? (
          <div className="cleanup-empty modal-error">{loaded.error}</div>
        ) : groups.length === 0 ? (
          <>
            <div className="cleanup-empty">Nothing to tidy. Every branch is fresh or still in use.</div>
            <div className="modal-footer">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <CleanupList groups={groups} nowMs={nowMs} onDelete={onDelete} onClose={onClose} />
        )}
      </div>
    </div>
  )
}
