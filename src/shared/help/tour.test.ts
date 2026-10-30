import { describe, expect, it } from 'vitest'
import { completedHelpSettings, normalizeHelpSettings, shouldAutoStartTour, TOUR_VERSION } from './tour'

describe('normalizeHelpSettings', () => {
  it('defaults to a tour not yet seen', () => {
    expect(normalizeHelpSettings(undefined)).toEqual({
      tourCompleted: false,
      tourVersion: 0
    })
    expect(normalizeHelpSettings('nope')).toEqual({
      tourCompleted: false,
      tourVersion: 0
    })
  })

  it('keeps valid values and drops bad ones', () => {
    expect(normalizeHelpSettings({ tourCompleted: true, tourVersion: 2 })).toEqual({
      tourCompleted: true,
      tourVersion: 2
    })
    expect(normalizeHelpSettings({ tourCompleted: 'yes', tourVersion: -3 })).toEqual({
      tourCompleted: false,
      tourVersion: 0
    })
    expect(normalizeHelpSettings({ tourCompleted: true, tourVersion: Number.NaN })).toEqual({
      tourCompleted: true,
      tourVersion: 0
    })
  })
})

describe('shouldAutoStartTour', () => {
  it('starts on first use once a repo is open', () => {
    const fresh = normalizeHelpSettings(undefined)
    expect(shouldAutoStartTour(fresh, false)).toBe(false)
    expect(shouldAutoStartTour(fresh, true)).toBe(true)
  })

  it('stays away once finished or skipped', () => {
    expect(shouldAutoStartTour(completedHelpSettings(), true)).toBe(false)
  })

  it('comes back when the tour has a newer version', () => {
    expect(shouldAutoStartTour({ tourCompleted: true, tourVersion: TOUR_VERSION - 1 }, true)).toBe(true)
    expect(shouldAutoStartTour({ tourCompleted: true, tourVersion: TOUR_VERSION + 1 }, true)).toBe(false)
  })
})
