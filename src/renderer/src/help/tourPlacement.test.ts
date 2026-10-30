import { describe, expect, it } from 'vitest'
import { placeCard } from './tourPlacement'

const viewport = { width: 1000, height: 800 }
const card = { width: 300, height: 200 }

describe('placeCard', () => {
  it('centres the card when there is no target', () => {
    expect(placeCard(null, 'bottom', card, viewport)).toEqual({
      top: 300,
      left: 350
    })
  })

  it('puts the card on the preferred side, centred on the target', () => {
    const target = { top: 10, left: 400, width: 200, height: 30 }
    expect(placeCard(target, 'bottom', card, viewport)).toEqual({
      top: 54,
      left: 350
    })
  })

  it('flips to the opposite side when the preferred one has no room', () => {
    const target = { top: 300, left: 20, width: 100, height: 100 }
    expect(placeCard(target, 'left', card, viewport)).toEqual({
      top: 250,
      left: 134
    })
  })

  it('keeps the card on screen near the window edge', () => {
    const target = { top: 10, left: 950, width: 40, height: 30 }
    expect(placeCard(target, 'bottom', card, viewport).left).toBe(1000 - 300 - 12)
  })

  it('goes inside a target that fills the window', () => {
    const target = { top: 0, left: 0, width: 1000, height: 800 }
    expect(placeCard(target, 'left', card, viewport)).toEqual({
      top: 586,
      left: 350
    })
  })
})
