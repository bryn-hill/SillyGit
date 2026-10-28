import { useEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import { DRAG_THRESHOLD, DROP_ATTR, dropTargetOf, sourceName, type DragSource } from '../lib/refDrag'

// GitKraken-style drag and drop of branches and commits, with pointer events
// rather than HTML5 drag and drop, which swallows the clicks and double-clicks
// the same labels and rows need. A press only becomes a drag once the pointer
// has moved a few pixels.

export interface RefDrag {
  /** Call from onPointerDown on anything draggable. */
  begin: (e: PointerEvent, source: DragSource) => void
}

// There's one pointer, so one drag at a time; the mounted layer handles it.
let active: RefDrag = { begin: () => {} }
const handle: RefDrag = { begin: (e, source) => active.begin(e, source) }

export const useRefDrag = (): RefDrag => handle

/** Props that make an element a drop target for `branch` (a local branch), or nothing. */
export const dropTarget = (branch: string | null | undefined): Record<string, string> =>
  branch ? { [DROP_ATTR]: branch } : {}

// How close to a scrolling list's top or bottom edge the pointer scrolls it, and how fast.
const EDGE = 32
const EDGE_SPEED = 12

interface Ghost {
  source: DragSource
  x: number
  y: number
  target: string | null
}

/** Runs drags begun with useRefDrag and draws what's being dragged. Mount it once. */
export default function RefDragLayer({
  onDrop
}: {
  /** A drag let go over a branch; x and y are where, for the menu. */
  onDrop: (source: DragSource, target: string, x: number, y: number) => void
}): JSX.Element | null {
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const onDropRef = useRef(onDrop)

  const begin = (e: PointerEvent, source: DragSource): void => {
    if (e.button !== 0 || e.ctrlKey || cleanup.current) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false
    let x = startX
    let y = startY
    let target: string | null = null
    let over: Element | null = null
    let scroller: Element | null = null

    const mark = (el: Element | null): void => {
      if (el === over) return
      over?.removeAttribute('data-drop-over')
      el?.setAttribute('data-drop-over', '')
      over = el
    }

    const locate = (): void => {
      const el = document.elementFromPoint(x, y)
      target = dropTargetOf(el, source)
      mark(target ? (el?.closest(`[${DROP_ATTR}]`) ?? null) : null)
      scroller = el?.closest('[data-drag-scroll]') ?? null
      setGhost({ source, x, y, target })
    }

    // Scroll a list while the pointer rests near its edge, so a branch can be
    // dropped on one further up or down.
    const timer = window.setInterval(() => {
      if (!dragging || !scroller) return
      const rect = scroller.getBoundingClientRect()
      const step = y < rect.top + EDGE ? -EDGE_SPEED : y > rect.bottom - EDGE ? EDGE_SPEED : 0
      if (step === 0) return
      scroller.scrollTop += step
      locate()
    }, 16)

    const move = (ev: globalThis.PointerEvent): void => {
      x = ev.clientX
      y = ev.clientY
      if (!dragging) {
        if (Math.hypot(x - startX, y - startY) < DRAG_THRESHOLD) return
        dragging = true
        window.getSelection()?.removeAllRanges()
        document.body.classList.add('ref-dragging')
      }
      locate()
    }

    const end = (drop: boolean): void => {
      cleanup.current?.()
      if (!dragging) return
      // The click that ends a drag mustn't also select or open what it's over.
      const swallow = (ev: MouseEvent): void => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      if (drop && target) onDropRef.current(source, target, x, y)
    }

    const up = (): void => end(true)
    const cancel = (): void => end(false)
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape' && dragging) {
        ev.preventDefault()
        cancel()
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
    cleanup.current = () => {
      window.clearInterval(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      document.body.classList.remove('ref-dragging')
      mark(null)
      setGhost(null)
      cleanup.current = null
    }
  }

  // The latest begin and onDrop, for drags started from other components.
  useEffect(() => {
    onDropRef.current = onDrop
    active = { begin }
  })
  useEffect(
    () => () => {
      active = { begin: () => {} }
      cleanup.current?.()
    },
    []
  )

  if (!ghost) return null
  return (
    <div
      className={`ref-drag-ghost ${ghost.target ? 'has-target' : ''}`}
      data-testid="drag-ghost"
      style={{ left: ghost.x + 14, top: ghost.y + 10 }}
      aria-hidden="true"
    >
      <span className="ref-drag-ghost-source">{sourceName(ghost.source)}</span>
      {ghost.target && <span className="ref-drag-ghost-target"> → {ghost.target}</span>}
    </div>
  )
}
