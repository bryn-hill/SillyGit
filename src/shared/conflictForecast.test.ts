import { describe, expect, it } from 'vitest'
import type { BranchInfo } from './types'
import { conflictSummary, fileList, forecastKey, forecastPairs, parseMergeTreeNames } from './conflictForecast'

const local = (name: string, hash: string, extra: Partial<BranchInfo> = {}): BranchInfo => ({
  name,
  hash,
  current: false,
  remote: false,
  ...extra
})

const target = { ref: 'origin/main', local: 'main', hash: 'm1' }

describe('forecastPairs', () => {
  it('checks each branch against the target and the current branch', () => {
    const branches = [
      local('main', 'm0', { upstream: 'origin/main' }),
      local('feature', 'f1', { current: true }),
      local('other', 'o1'),
      { name: 'origin/main', hash: 'm1', current: false, remote: true }
    ]
    expect(forecastPairs(branches, target)).toEqual([
      { branch: 'feature', tip: 'f1', other: 'origin/main', otherTip: 'm1', kind: 'target' },
      { branch: 'other', tip: 'o1', other: 'origin/main', otherTip: 'm1', kind: 'target' },
      { branch: 'other', tip: 'o1', other: 'feature', otherTip: 'f1', kind: 'current' }
    ])
  })

  it("doesn't check against the current branch when it is the target's local copy", () => {
    const branches = [local('main', 'm0', { current: true, upstream: 'origin/main' }), local('feature', 'f1')]
    expect(forecastPairs(branches, target).map((p) => p.kind)).toEqual(['target'])
  })

  it('skips branches sitting on the target and works without a target', () => {
    expect(forecastPairs([local('fresh', 'm1')], target)).toEqual([])
    const branches = [local('a', 'a1', { current: true }), local('b', 'b1')]
    expect(forecastPairs(branches, null)).toEqual([{ branch: 'b', tip: 'b1', other: 'a', otherTip: 'a1', kind: 'current' }])
  })

  it('has no current-branch checks on a detached HEAD', () => {
    expect(forecastPairs([local('a', 'a1'), local('b', 'b1')], null)).toEqual([])
  })
})

describe('parseMergeTreeNames', () => {
  it('reads the tree and each conflicted path once', () => {
    expect(parseMergeTreeNames('abc123\0a.txt\0a.txt\0dir/b c.txt\0')).toEqual({
      tree: 'abc123',
      files: ['a.txt', 'dir/b c.txt']
    })
    expect(parseMergeTreeNames('abc123\0')).toEqual({ tree: 'abc123', files: [] })
    expect(parseMergeTreeNames('')).toEqual({ tree: '', files: [] })
  })
})

describe('forecastKey', () => {
  it('changes when a tip or the current branch moves', () => {
    const before = forecastKey([local('a', '1', { current: true }), local('b', '2')])
    expect(forecastKey([local('a', '1', { current: true }), local('b', '3')])).not.toBe(before)
    expect(forecastKey([local('a', '1'), local('b', '2', { current: true })])).not.toBe(before)
    expect(forecastKey([local('a', '1', { current: true }), local('b', '2')])).toBe(before)
  })
})

describe('summaries', () => {
  it('names a few files and counts the rest', () => {
    expect(fileList(['a'])).toBe('a')
    expect(fileList(['a', 'b'])).toBe('a and b')
    expect(fileList(['a', 'b', 'c'])).toBe('a, b and c')
    expect(fileList(['a', 'b', 'c', 'd'])).toBe('a, b and 2 more files')
    expect(conflictSummary([{ with: 'origin/main', kind: 'target', files: ['x.ts'] }])).toBe(
      'Would conflict with origin/main in x.ts'
    )
  })
})
