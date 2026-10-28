import { describe, expect, it } from 'vitest'
import { formatCount, groupCandidates, preselected, tidyCount, type CleanupCandidate } from './branchCleanup'
import { DEFAULT_BRANCH_LIST_SETTINGS } from './branchStatus'
import type { BranchInfo } from './types'

const DAY = 24 * 60 * 60
const NOW_MS = 1_800_000_000_000
const daysAgo = (days: number): number => NOW_MS / 1000 - days * DAY

const candidate = (over: Partial<CleanupCandidate>): CleanupCandidate => ({
  name: 'x',
  hash: 'abc',
  gone: false,
  mergedInto: null,
  localOnly: 0,
  lastCommitAt: daysAgo(1),
  ...over
})

describe('groupCandidates', () => {
  it('puts each branch in the first group that fits and drops fresh unmerged ones', () => {
    const groups = groupCandidates(
      [
        candidate({ name: 'gone-and-merged', gone: true, mergedInto: 'origin/main' }),
        candidate({ name: 'merged', mergedInto: 'origin/main' }),
        candidate({ name: 'old', lastCommitAt: daysAgo(90) }),
        candidate({ name: 'fresh' })
      ],
      NOW_MS,
      DEFAULT_BRANCH_LIST_SETTINGS
    )
    expect(groups.map((g) => [g.id, g.candidates.map((c) => c.name)])).toEqual([
      ['gone', ['gone-and-merged']],
      ['merged', ['merged']],
      ['stale', ['old']]
    ])
    expect(groups[2].title).toBe('No commits in 30+ days')
  })

  it('has no stale group when stale tags are off', () => {
    const groups = groupCandidates([candidate({ lastCommitAt: daysAgo(400) })], NOW_MS, {
      staleEnabled: false,
      staleDays: 30
    })
    expect(groups).toEqual([])
  })
})

describe('preselected', () => {
  it('ticks gone and merged branches but not stale ones', () => {
    expect(preselected(candidate({ gone: true, localOnly: 3 }))).toBe(true)
    expect(preselected(candidate({ mergedInto: 'main' }))).toBe(true)
    expect(preselected(candidate({ lastCommitAt: daysAgo(400) }))).toBe(false)
  })
})

describe('tidyCount', () => {
  const branch = (over: Partial<BranchInfo>): BranchInfo => ({
    name: 'b',
    current: false,
    remote: false,
    lastCommitAt: daysAgo(1),
    ...over
  })

  it('counts gone and stale local branches, skipping current, favourites and remotes', () => {
    const branches = [
      branch({ name: 'gone', upstreamGone: true }),
      branch({ name: 'old', lastCommitAt: daysAgo(60) }),
      branch({ name: 'fresh' }),
      branch({ name: 'current', current: true, upstreamGone: true }),
      branch({ name: 'starred', upstreamGone: true }),
      branch({ name: 'origin/old', remote: true, lastCommitAt: daysAgo(60) })
    ]
    expect(tidyCount(branches, new Set(['starred']), NOW_MS, DEFAULT_BRANCH_LIST_SETTINGS)).toBe(2)
  })
})

describe('formatCount', () => {
  it('caps at 99+', () => {
    expect(formatCount(7)).toBe('7')
    expect(formatCount(99)).toBe('99')
    expect(formatCount(100)).toBe('99+')
  })
})
