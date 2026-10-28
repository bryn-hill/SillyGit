import { describe, expect, it } from 'vitest'
import type { GraphCommit } from '../../../shared/types'
import { layoutGraph } from './graphLayout'
import { newCommitAtHead } from './mergeBurst'

const commit = (hash: string, parents: string[]): GraphCommit =>
  ({ hash, parents, author: 'a', authorEmail: 'a@example.com', date: '', committedAt: '', subject: hash, refs: [] })

const before = layoutGraph([commit('main1', ['root']), commit('feat', ['root']), commit('root', [])])
const merged = layoutGraph([
  commit('M', ['main1', 'feat']),
  commit('main1', ['root']),
  commit('feat', ['root']),
  commit('root', [])
])

describe('newCommitAtHead', () => {
  it('finds a merge HEAD just moved onto', () => {
    expect(newCommitAtHead(before, merged, 'M')).toBe('M')
  })

  it('finds a plain commit HEAD just moved onto', () => {
    const next = layoutGraph([commit('c', ['main1']), commit('main1', ['root']), commit('feat', ['root']), commit('root', [])])
    expect(newCommitAtHead(before, next, 'c')).toBe('c')
  })

  it('ignores a pull that brought in several commits at once', () => {
    const next = layoutGraph([
      commit('c2', ['c1']),
      commit('c1', ['main1']),
      commit('main1', ['root']),
      commit('feat', ['root']),
      commit('root', [])
    ])
    expect(newCommitAtHead(before, next, 'c2')).toBeNull()
  })

  it('ignores a commit that was already there, e.g. after a refresh or loading more', () => {
    expect(newCommitAtHead(merged, merged, 'M')).toBeNull()
  })

  it('ignores the first load and switching to another repo', () => {
    expect(newCommitAtHead([], merged, 'M')).toBeNull()
    const other = layoutGraph([commit('x', ['y']), commit('y', [])])
    expect(newCommitAtHead(other, merged, 'M')).toBeNull()
  })

  it('ignores a new commit that is not checked out', () => {
    expect(newCommitAtHead(before, merged, 'main1')).toBeNull()
    expect(newCommitAtHead(before, merged, null)).toBeNull()
  })
})
