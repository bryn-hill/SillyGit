import { useEffect, useRef, useState, type JSX, type MouseEvent, type ReactNode } from 'react'
import type { RefBadge, RefPill } from '../lib/refs'

export interface RefHandlers {
  onClick: (e: MouseEvent) => void
  onDoubleClick: (badge: RefBadge) => void
  onContextMenu: (e: MouseEvent, badge: RefBadge) => void
}

const icon = (path: ReactNode, label?: string): JSX.Element => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden={label ? undefined : true}
    aria-label={label}
  >
    {path}
  </svg>
)

const CheckIcon = (): JSX.Element => icon(<path d="M3 8.5l3 3 7-7" />)
const LaptopIcon = (): JSX.Element =>
  icon(
    <>
      <rect x="3" y="3.5" width="10" height="7" rx="1" />
      <path d="M1.5 12.5h13" />
    </>
  )
const CloudIcon = (): JSX.Element =>
  icon(<path d="M4.5 12.5h7a3 3 0 0 0 .4-6A4 4 0 0 0 4.2 7 2.75 2.75 0 0 0 4.5 12.5z" />)
const TagIcon = (): JSX.Element =>
  icon(
    <>
      <path d="M2 2.5v5l6.5 6.5 5-5L7 2.5z" />
      <circle cx="5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  )

function describe(pill: RefPill): string {
  const lines = [pill.primary.kind === 'tag' ? `Tag ${pill.name}` : pill.local ? pill.local.label : pill.primary.label]
  for (const r of pill.remotes) if (r !== pill.primary) lines.push(r.label)
  if (pill.primary.kind === 'local' || pill.primary.kind === 'remote') lines.push('Double-click to check out')
  return lines.join('\n')
}

function Pill({ pill, color, handlers }: { pill: RefPill; color: string; handlers: RefHandlers }): JSX.Element {
  const { primary } = pill
  return (
    <span
      className={`ref-badge ref-pill ref-${primary.kind}`}
      style={{ ['--lane' as string]: color }}
      data-ref={primary.label}
      title={describe(pill)}
      onClick={handlers.onClick}
      onDoubleClick={(e) => {
        e.stopPropagation()
        handlers.onDoubleClick(primary)
      }}
      onContextMenu={(e) => handlers.onContextMenu(e, primary)}
    >
      {primary.kind === 'head' && (
        <span className="ref-pill-check" aria-label="Checked out">
          <CheckIcon />
        </span>
      )}
      <span className="ref-pill-name">{pill.name}</span>
      {pill.local && (
        <span className="ref-pill-icon" title={`Local branch ${pill.local.label}`}>
          <LaptopIcon />
        </span>
      )}
      {pill.remotes.map((r) =>
        // A remote sharing the pill with its local branch is a target of its own.
        r === primary ? (
          <span key={r.label} className="ref-pill-icon" title={r.label}>
            <CloudIcon />
          </span>
        ) : (
          <span
            key={r.label}
            className="ref-pill-icon ref-pill-remote"
            data-ref={r.label}
            title={`${r.label}\nDouble-click to check out`}
            onDoubleClick={(e) => {
              e.stopPropagation()
              handlers.onDoubleClick(r)
            }}
            onContextMenu={(e) => {
              e.stopPropagation()
              handlers.onContextMenu(e, r)
            }}
          >
            <CloudIcon />
          </span>
        )
      )}
      {primary.kind === 'tag' && (
        <span className="ref-pill-icon">
          <TagIcon />
        </span>
      )}
    </span>
  )
}

/** The "+N" chip; hovering or clicking it lists the row's other refs. */
function Overflow({ pills, color, handlers }: { pills: RefPill[]; color: string; handlers: RefHandlers }): JSX.Element {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const chipRef = useRef<HTMLSpanElement>(null)

  const open = (): void => {
    const rect = chipRef.current?.getBoundingClientRect()
    if (rect) setPos({ left: rect.left, top: rect.bottom + 2 })
  }

  // The list is positioned for where the chip was; scrolling the graph would leave it behind.
  useEffect(() => {
    if (!pos) return
    const close = (): void => setPos(null)
    const closeOutside = (e: globalThis.MouseEvent): void => {
      if (!chipRef.current?.parentElement?.contains(e.target as Node)) close()
    }
    const scroller = chipRef.current?.closest('[role="listbox"]')
    scroller?.addEventListener('scroll', close)
    window.addEventListener('mousedown', closeOutside)
    return () => {
      scroller?.removeEventListener('scroll', close)
      window.removeEventListener('mousedown', closeOutside)
    }
  }, [pos])

  return (
    <span className="ref-overflow" onMouseEnter={open} onMouseLeave={() => setPos(null)}>
      <span
        ref={chipRef}
        className="ref-overflow-chip"
        role="button"
        aria-label={`${pills.length} more branches and tags`}
        aria-expanded={pos !== null}
        onClick={(e) => {
          // Hovering has usually opened it already; a click only makes sure.
          e.stopPropagation()
          open()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        +{pills.length}
      </span>
      {pos && (
        <span className="ref-overflow-list" role="group" aria-label="More branches and tags" style={pos}>
          {pills.map((p) => (
            <Pill key={p.primary.label} pill={p} color={color} handlers={handlers} />
          ))}
        </span>
      )}
    </span>
  )
}

/**
 * A row's cell in the Branch / Tag column: its most important ref as a pill
 * in the lane's colour, "+N" for the rest, and a line over to the commit.
 */
export default function RefCell({
  pills,
  color,
  width,
  handlers
}: {
  pills: RefPill[]
  color: string
  width: number
  handlers: RefHandlers
}): JSX.Element {
  return (
    <div className="ref-cell" data-testid="ref-cell" style={{ width }}>
      {pills.length > 0 && (
        <>
          <Pill pill={pills[0]} color={color} handlers={handlers} />
          {pills.length > 1 && <Overflow pills={pills.slice(1)} color={color} handlers={handlers} />}
          <span className="ref-connector" style={{ background: color }} aria-hidden="true" />
        </>
      )}
    </div>
  )
}
