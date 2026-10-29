import type { JSX, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'

const KEY_STEP = 10

/**
 * The drag handle on a column header's edge. `side` is the edge it sits on:
 * a column right of the commit message has its handle on the left, so
 * dragging left widens it. Double-click resets; arrow keys step by 10px.
 */
export default function ColumnResizer({
  label,
  side,
  width,
  min,
  max,
  onResize,
  onReset
}: {
  label: string
  side: 'left' | 'right'
  width: number
  min: number
  max: number
  onResize: (width: number) => void
  onReset: () => void
}): JSX.Element {
  const sign = side === 'right' ? 1 : -1

  const startDrag = (e: ReactMouseEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const onMove = (ev: MouseEvent): void => onResize(width + sign * (ev.clientX - startX))
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('col-resizing')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('col-resizing')
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      onResize(width + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP) * sign)
    } else if (e.key === 'Home' || e.key === 'Enter') {
      e.preventDefault()
      onReset()
    }
  }

  return (
    <div
      className={`col-resize-handle col-resize-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onMouseDown={startDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      // A click on the handle shouldn't reach the header or start a text selection.
      onClick={(e) => e.stopPropagation()}
    />
  )
}
