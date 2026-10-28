import { useMemo, type JSX } from 'react'
import {
  isHunkSideTaken,
  isLinePicked,
  isSideTaken,
  setSideTaken,
  toggleHunkSide,
  toggleLine,
  type ConflictPicks,
  type ConflictSegment,
  type ConflictSide
} from '../../../../shared/conflicts'
import { SIDE_LETTER, paneRows, stripEol } from './paneRows'

export default function SidePane({
  side,
  label,
  segments,
  picks,
  locked,
  onPicksChange,
  paneRef,
  onScroll
}: {
  side: ConflictSide
  label: string
  segments: ConflictSegment[]
  picks: ConflictPicks
  locked: boolean
  onPicksChange: (picks: ConflictPicks) => void
  paneRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
}): JSX.Element {
  const rows = useMemo(() => paneRows(segments, side), [segments, side])
  const allTaken = isSideTaken(segments, picks, side)
  const letter = SIDE_LETTER[side]
  const sideName = side === 'ours' ? 'current' : 'incoming'
  return (
    <section className={`merge-pane merge-pane-${side}`} aria-label={`${letter} (${sideName}): ${label}`}>
      <header className="merge-pane-header">
        <label className="merge-take-all">
          <input
            type="checkbox"
            checked={allTaken}
            disabled={locked}
            aria-label={`Take all from ${letter}`}
            title={allTaken ? 'Untake all' : 'Take all'}
            onChange={() => onPicksChange(setSideTaken(segments, picks, side, !allTaken))}
          />
          <span className={`merge-badge merge-badge-${side}`}>{letter}</span>
          <span className="merge-pane-label">{label}</span>
        </label>
      </header>
      <div className="merge-pane-body" ref={paneRef} onScroll={onScroll}>
        {rows.map((row, i) => {
          if (row.kind === 'common') {
            return (
              <div key={i} className="merge-line">
                <span className="merge-gutter" />
                <span className="merge-lineno">{row.lineNo}</span>
                <span className="merge-text">{stripEol(row.text)}</span>
              </div>
            )
          }
          if (row.kind === 'hunk-header') {
            const taken = isHunkSideTaken(row.hunk, picks, side)
            return (
              <div key={i} className="merge-hunk-header" data-hunk={row.hunk.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={taken}
                    disabled={locked || row.hunk[side].length === 0}
                    aria-label={`Take ${letter} conflict ${row.number}`}
                    onChange={() => onPicksChange(toggleHunkSide(row.hunk, picks, side))}
                  />
                  Conflict {row.number}
                  {row.hunk[side].length === 0 && <span className="merge-dim"> (no lines on this side)</span>}
                </label>
              </div>
            )
          }
          if (row.kind === 'pad') return <div key={i} className="merge-line merge-pad" />
          const picked = isLinePicked(picks, row.hunk.id, side, row.index)
          return (
            <div key={i} className={`merge-line merge-conflict-line ${picked ? 'picked' : ''}`}>
              <button
                className="merge-line-button"
                disabled={locked}
                title={picked ? "Don't take this line" : 'Take this line'}
                aria-label={`${picked ? "Don't take" : 'Take'} ${letter} line ${row.lineNo}`}
                aria-pressed={picked}
                onClick={() => onPicksChange(toggleLine(picks, row.hunk.id, side, row.index))}
              >
                {picked ? '✓' : '⊕'}
              </button>
              <span className="merge-lineno">{row.lineNo}</span>
              <span className="merge-text">{stripEol(row.text)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
