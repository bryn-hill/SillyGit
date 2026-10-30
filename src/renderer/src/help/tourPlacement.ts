import type { TourStep } from '../../../shared/help/types'

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

type Placement = NonNullable<TourStep['placement']>

const OPPOSITE: Record<Placement, Placement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
}
const GAP = 14
const MARGIN = 12

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, Math.max(min, max)))

/**
 * Where a step's card goes: beside the target on the preferred side, else the
 * opposite side, else any side with room, else inside the target near its
 * bottom (for big targets like the graph). No target puts it in the middle.
 * Always kept on screen.
 */
export function placeCard(
  target: Box | null,
  placement: Placement | undefined,
  card: { width: number; height: number },
  viewport: { width: number; height: number }
): { top: number; left: number } {
  const maxLeft = viewport.width - card.width - MARGIN
  const maxTop = viewport.height - card.height - MARGIN
  if (!target) {
    return {
      top: clamp((viewport.height - card.height) / 2, MARGIN, maxTop),
      left: clamp((viewport.width - card.width) / 2, MARGIN, maxLeft)
    }
  }
  const preferred = placement ?? 'bottom'
  const order: Placement[] = [preferred, OPPOSITE[preferred], ...(['bottom', 'right', 'top', 'left'] as const)]
  const centreLeft = clamp(target.left + target.width / 2 - card.width / 2, MARGIN, maxLeft)
  const centreTop = clamp(target.top + target.height / 2 - card.height / 2, MARGIN, maxTop)
  for (const side of order) {
    if (side === 'bottom' && target.top + target.height + GAP + card.height + MARGIN <= viewport.height) {
      return { top: target.top + target.height + GAP, left: centreLeft }
    }
    if (side === 'top' && target.top - GAP - card.height >= MARGIN) {
      return { top: target.top - GAP - card.height, left: centreLeft }
    }
    if (side === 'right' && target.left + target.width + GAP + card.width + MARGIN <= viewport.width) {
      return { top: centreTop, left: target.left + target.width + GAP }
    }
    if (side === 'left' && target.left - GAP - card.width >= MARGIN) {
      return { top: centreTop, left: target.left - GAP - card.width }
    }
  }
  return {
    top: clamp(target.top + target.height - card.height - GAP, MARGIN, maxTop),
    left: centreLeft
  }
}
