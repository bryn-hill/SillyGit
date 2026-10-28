import { describe, expect, it } from 'vitest'
import type { GraphCommit } from '../../../shared/types'
import { layoutGraph } from './graphLayout'
import { newMergeAtHead, sparks } from './mergeBurst'

const commit = (hash: string, parents: string[]): GraphCommit =>
  ({ hash, parents, author: 'a', authorEmail: 'a@example.com', date: '', committedAt: '', subject: hash, refs: [] })

const before = layoutGraph([commit('main1', ['root']), commit('feat', ['root']), commit('root', [])])
const merged = layoutGraph([
  commit('M', ['main1', 'feat']),
  commit('main1', ['root']),
  commit('feat', ['root']),
  commit('root', [])
])

describe('newMergeAtHead', () => {
  it('finds a merge HEAD just moved onto', () => {
    expect(newMergeAtHead(before, merged, 'M')).toBe('M')
  })

  it('ignores a new commit that is not a merge', () => {
    const next = layoutGraph([commit('c', ['main1']), commit('main1', ['root']), commit('feat', ['root']), commit('root', [])])
    expect(newMergeAtHead(before, next, 'c')).toBeNull()
  })

  it('ignores a merge that was already there, e.g. after a refresh or loading more', () => {
    expect(newMergeAtHead(merged, merged, 'M')).toBeNull()
  })

  it('ignores the first load and switching to another repo', () => {
    expect(newMergeAtHead([], merged, 'M')).toBeNull()
    const other = layoutGraph([commit('x', ['y']), commit('y', [])])
    expect(newMergeAtHead(other, merged, 'M')).toBeNull()
  })

  it('ignores a merge that is not checked out', () => {
    expect(newMergeAtHead(before, merged, 'main1')).toBeNull()
    expect(newMergeAtHead(before, merged, null)).toBeNull()
  })
})

describe('sparks', () => {
  it('is the same every time and uses the given colours', () => {
    const a = sparks(['#111111', '#222222'])
    expect(a).toEqual(sparks(['#111111', '#222222']))
    expect(a).toHaveLength(22)
    expect(new Set(a.map((s) => s.color))).toEqual(new Set(['#111111', '#222222', '#ffffff']))
  })
})
