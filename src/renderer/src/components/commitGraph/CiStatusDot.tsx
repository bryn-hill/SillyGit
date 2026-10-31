import { useEffect, useRef, useState, type JSX } from 'react'
import { ciSummary, rerunTargets, type CiRerun, type CommitCiStatus } from '../../../../shared/ciStatus'
import type { PrCheckState } from '../../../../shared/prReview'

const CHECK_ICONS: Record<PrCheckState, string> = {
  success: '✓',
  failure: '✕',
  pending: '●',
  neutral: '–',
  skipped: '–'
}

const POPOVER_HEIGHT = 280

/** The symbol for a commit's overall result when Settings asks for symbols. */
const RESULT_SYMBOLS: Record<CommitCiStatus['state'], string> = {
  success: '✓',
  failure: '✕',
  pending: '●',
  neutral: '–'
}

/**
 * A commit's CI result at the start of the Branch / Tag column: a coloured line
 * the height of the row, so neighbouring commits with the same result join up,
 * or a ✓ ✕ ● symbol when Settings asks for symbols. Clicking it lists the
 * checks, each opening its job on the host, with "Re-run failed" when the
 * failures can be started again.
 */
export default function CiStatusDot({
  status,
  symbols,
  onRerun
}: {
  status: CommitCiStatus
  symbols: boolean
  onRerun: (targets: CiRerun[]) => Promise<{ ok: true } | { ok: false; error: string }>
}): JSX.Element {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const summary = ciSummary(status)
  const targets = rerunTargets(status.checks)

  const open = (): void => {
    const rect = dotRef.current?.getBoundingClientRect()
    if (!rect) return
    setError(null)
    // Open upwards when there isn't room below.
    setPos(
      rect.bottom + POPOVER_HEIGHT > window.innerHeight
        ? { left: rect.left, bottom: window.innerHeight - rect.top + 2 }
        : { left: rect.left, top: rect.bottom + 2 }
    )
  }

  // Positioned for where the dot was; scrolling the graph would leave it behind.
  useEffect(() => {
    if (!pos) return
    const close = (): void => setPos(null)
    const closeOutside = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!popRef.current?.contains(target) && !dotRef.current?.contains(target)) close()
    }
    const closeOnEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    const scroller = dotRef.current?.closest('[role="listbox"]')
    scroller?.addEventListener('scroll', close)
    window.addEventListener('mousedown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      scroller?.removeEventListener('scroll', close)
      window.removeEventListener('mousedown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [pos])

  const rerun = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const res = await onRerun(targets)
    setBusy(false)
    if (!res.ok) setError(res.error)
  }

  return (
    <>
      <span
        ref={dotRef}
        className={`ci-dot ${symbols ? 'ci-dot-symbol' : 'ci-dot-line'} ci-dot-${status.state}`}
        role="button"
        tabIndex={-1}
        data-testid="ci-dot"
        data-state={status.state}
        aria-label={`CI: ${summary}`}
        aria-expanded={pos !== null}
        title={`${summary}\nClick for details`}
        // The dot opens its own list; it doesn't select or drag the row.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          if (pos) setPos(null)
          else open()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {symbols ? RESULT_SYMBOLS[status.state] : null}
      </span>
      {pos && (
        <div
          ref={popRef}
          className="ci-popover"
          role="dialog"
          aria-label="CI checks"
          style={pos}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className={`ci-popover-summary ci-check-${status.state}`}>{summary}</div>
          <ul className="ci-popover-list">
            {status.checks.map((c, i) => (
              <li key={`${c.name}-${i}`} className={`ci-check ci-check-${c.state}`} data-testid="ci-check" data-state={c.state}>
                <span className="ci-check-icon" aria-hidden="true">
                  {CHECK_ICONS[c.state]}
                </span>
                {c.url ? (
                  <button
                    className="ci-check-name link-button"
                    title={`Open ${c.name} on the web`}
                    onClick={() => void window.api.openExternal(c.url!)}
                  >
                    {c.name}
                  </button>
                ) : (
                  <span className="ci-check-name">{c.name}</span>
                )}
                {c.description && <span className="ci-check-desc">{c.description}</span>}
              </li>
            ))}
          </ul>
          {error && (
            <div className="ci-popover-error" role="alert">
              {error}
            </div>
          )}
          {targets.length > 0 && (
            <div className="ci-popover-actions">
              <button disabled={busy} onClick={() => void rerun()}>
                {busy ? 'Starting…' : 'Re-run failed'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
