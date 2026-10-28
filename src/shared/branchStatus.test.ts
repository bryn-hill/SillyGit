import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BRANCH_LIST_SETTINGS,
  favouriteBranches,
  formatAge,
  normalizeBranchListSettings,
  parseTrack,
  staleAge,
  toggleFavourite
} from './branchStatus'
import type { BranchInfo } from './types'

const DAY = 24 * 60 * 60
const now = Date.UTC(2026, 9, 28) // ms
const branch = (name: string, daysOld?: number): BranchInfo => ({
  name,
  current: false,
  remote: false,
  lastCommitAt: daysOld === undefined ? undefined : now / 1000 - daysOld * DAY
})

describe('parseTrack', () => {
  it('reads ahead and behind counts', () => {
    expect(parseTrack('ahead 2, behind 3')).toEqual({ ahead: 2, behind: 3, gone: false })
    expect(parseTrack('behind 1')).toEqual({ ahead: 0, behind: 1, gone: false })
    expect(parseTrack('ahead 4')).toEqual({ ahead: 4, behind: 0, gone: false })
  })

  it('spots a deleted upstream', () => {
    expect(parseTrack('gone')).toEqual({ ahead: 0, behind: 0, gone: true })
  })

  it('treats an empty track as in step', () => {
    expect(parseTrack('')).toEqual({ ahead: 0, behind: 0, gone: false })
  })
})

describe('formatAge', () => {
  it.each([
    [0, '0d'],
    [5, '5d'],
    [13, '13d'],
    [14, '2w'],
    [59, '8w'],
    [60, '2mo'],
    [364, '12mo'],
    [365, '1y'],
    [800, '2y']
  ])('%i days is %s', (days, label) => {
    expect(formatAge(days * DAY)).toBe(label)
  })
})

describe('staleAge', () => {
  const settings = { staleEnabled: true, staleDays: 30 }

  it('tags branches at or past the threshold', () => {
    expect(staleAge(branch('old', 30), now, settings)).toBe('4w')
    expect(staleAge(branch('older', 100), now, settings)).toBe('3mo')
  })

  it('leaves fresh branches alone', () => {
    expect(staleAge(branch('new', 29), now, settings)).toBeNull()
  })

  it('does nothing when switched off or the date is unknown', () => {
    expect(staleAge(branch('old', 100), now, { ...settings, staleEnabled: false })).toBeNull()
    expect(staleAge(branch('unknown'), now, settings)).toBeNull()
  })
})

describe('normalizeBranchListSettings', () => {
  it('fills in defaults', () => {
    expect(normalizeBranchListSettings(undefined)).toEqual(DEFAULT_BRANCH_LIST_SETTINGS)
    expect(normalizeBranchListSettings({ staleDays: -3, staleEnabled: 'yes' })).toEqual(DEFAULT_BRANCH_LIST_SETTINGS)
  })

  it('keeps valid values', () => {
    expect(normalizeBranchListSettings({ staleEnabled: false, staleDays: 90 })).toEqual({
      staleEnabled: false,
      staleDays: 90
    })
  })
})

describe('favourites', () => {
  it('lists starred branches that still exist, in starred order', () => {
    const all = [branch('main'), branch('a'), branch('b')]
    expect(favouriteBranches(all, ['b', 'gone', 'main']).map((b) => b.name)).toEqual(['b', 'main'])
  })

  it('toggles a star', () => {
    expect(toggleFavourite(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleFavourite(['a', 'b'], 'a')).toEqual(['b'])
  })
})
