import { useEffect, useEffectEvent, useRef, useState, type JSX } from 'react'
import type { TourStep } from '../../../shared/help/types'
import Markdown from '../components/claude/Markdown'
import { openHelp } from './openHelp'
import { placeCard, type Box } from './tourPlacement'
import { getHelpCentreState } from './helpCentreStore'

/** Room left around the spotlighted element. */
const PAD = 6

interface Props {
  step: TourStep
  index: number
  count: number
  onNext: () => void
  onBack: () => void
  onClose: () => void
}

function findTarget(target: string | undefined): HTMLElement | null {
  if (!target) return null
  const el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  // Hidden (display: none, collapsed) counts as not on screen.
  return rect.width > 0 && rect.height > 0 ? el : null
}

/**
 * One walkthrough step: dims the window, cuts a spotlight around the step's
 * target and shows the step's card beside it. Keyed by step, so it measures
 * afresh for each one.
 */
export default function TourOverlay({ step, index, count, onNext, onBack, onClose }: Props): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{
    hole: Box | null
    card: { top: number; left: number }
  } | null>(null)

  const measure = useEffectEvent(() => {
    const card = cardRef.current
    if (!card) return
    const el = findTarget(step.target)
    const r = el?.getBoundingClientRect()
    const hole = r
      ? {
          top: r.top - PAD,
          left: r.left - PAD,
          width: r.width + PAD * 2,
          height: r.height + PAD * 2
        }
      : null
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    setLayout({
      hole,
      card: placeCard(hole, step.placement, { width: card.offsetWidth, height: card.offsetHeight }, viewport)
    })
  })

  // Follows the target and the card as the window or the layout changes.
  useEffect(() => {
    const el = findTarget(step.target)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const observer = new ResizeObserver(() => measure())
    if (cardRef.current) observer.observe(cardRef.current)
    if (el) observer.observe(el)
    const onResize = (): void => measure()
    window.addEventListener('resize', onResize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [step.target])

  // Captured first, so the app's own shortcuts don't act behind the walkthrough.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // The help centre opened by "Learn more" sits on top and owns the keyboard.
    if (getHelpCentreState().open) return
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowRight') onNext()
    else if (e.key === 'ArrowLeft') onBack()
    else return
    e.preventDefault()
    e.stopPropagation()
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent): void => onKey(e)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  const last = index === count - 1
  const hole = layout?.hole ?? null
  return (
    <div className={`tour-overlay${hole ? '' : ' tour-overlay-dim'}`} data-testid="tour">
      {hole && (
        <div
          className="tour-spotlight"
          data-testid="tour-spotlight"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height
          }}
        />
      )}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        style={layout ? { top: layout.card.top, left: layout.card.left } : { visibility: 'hidden' }}
      >
        <div className="tour-progress">
          Step {index + 1} of {count}
        </div>
        <h2 id="tour-title" className="tour-title">
          {step.title}
        </h2>
        <div className="tour-body">
          <Markdown text={step.body} />
        </div>
        <div className="tour-footer">
          {!last && (
            <button className="link-button tour-skip" onClick={onClose}>
              Skip tour
            </button>
          )}
          {step.articleId && (
            <button className="subtle" onClick={() => openHelp(step.articleId)}>
              Learn more
            </button>
          )}
          <span className="tour-spacer" />
          {index > 0 && (
            <button className="subtle" onClick={onBack}>
              Back
            </button>
          )}
          {/* Focus follows the step, so Enter/Space moves on. */}
          <button className="tour-primary" onClick={onNext} autoFocus>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
