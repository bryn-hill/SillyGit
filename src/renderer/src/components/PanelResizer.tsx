import type { JSX, MouseEvent as ReactMouseEvent } from 'react'

export const MIN_PANEL_WIDTH = 160
const MAX_PANEL_FRACTION = 0.5

interface Props {
  /** Which neighbour the handle resizes: the one before it (grows rightwards) or after it (grows leftwards). */
  side: 'before' | 'after'
  onWidthChange: (width: number) => void
  /** Called on double-click to go back to the CSS default width. */
  onReset: () => void
}

/**
 * A drag handle between two panels in a row. It measures the panel it resizes
 * when a drag starts, so the panel's CSS default width needs no JS copy.
 */
export default function PanelResizer({ side, onWidthChange, onReset }: Props): JSX.Element {
  const handleDragStart = (e: ReactMouseEvent<HTMLDivElement>): void => {
    const panel = side === 'before' ? e.currentTarget.previousElementSibling : e.currentTarget.nextElementSibling
    if (!(panel instanceof HTMLElement)) return
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panel.offsetWidth
    const direction = side === 'before' ? 1 : -1
    const onMove = (ev: MouseEvent): void => {
      const max = Math.round(window.innerWidth * MAX_PANEL_FRACTION)
      const next = startWidth + direction * (ev.clientX - startX)
      onWidthChange(Math.min(Math.max(next, MIN_PANEL_WIDTH), max))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="panel-resizer" role="separator" aria-orientation="vertical">
      <div className="panel-resizer-handle" onMouseDown={handleDragStart} onDoubleClick={onReset} />
    </div>
  )
}
