import { describe, expect, it } from 'vitest'
import type { GraphCommit } from '../../../shared/types'
import { layoutGraph } from './graphLayout'
import { MAX_BURST_COMMITS, newCommits } from './mergeBurst'

const commit = (hash: string, parents: string[]): GraphCommit =>
  ({ hash, parents, author: 'a', authorEmail: 'a@example.com', date: '', committedAt: '', subject: hash, refs: [] })

const before = layoutGraph([commit('main1', ['root']), commit('feat', ['root']), commit('root', [])])
const merged = layoutGraph([
  commit('M', ['main1', 'feat']),
  commit('main1', ['root']),
  commit('feat', ['root']),
  commit('root', [])
])

describe('newCommits', () => {
  it('finds a merge that just landed', () => {
    expect(newCommits(before, merged)).toEqual(['M'])
  })

  it('finds a plain commit that just landed', () => {
    const next = layoutGraph([commit('c', ['main1']), commit('main1', ['root']), commit('feat', ['root']), commit('root', [])])
    expect(newCommits(before, next)).toEqual(['c'])
  })

  it('finds every commit a pull or fetch brought in, oldest first', () => {
    const next = layoutGraph([
      commit('c2', ['c1']),
      commit('f2', ['feat']),
      commit('c1', ['main1']),
      commit('main1', ['root']),
      commit('feat', ['root']),
      commit('root', [])
    ])
    expect(newCommits(before, next)).toEqual(['c1', 'f2', 'c2'])
  })

  it('animates only the newest of a big pull', () => {
    const many = Array.from({ length: MAX_BURST_COMMITS + 5 }, (_, i) => i)
    const next = layoutGraph([
      ...many.reverse().map((i) => commit(`n${i}`, [i === 0 ? 'main1' : `n${i - 1}`])),
      commit('main1', ['root']),
      commit('feat', ['root']),
      commit('root', [])
    ])
    const found = newCommits(before, next)
    expect(found).toHaveLength(MAX_BURST_COMMITS)
    expect(found.at(-1)).toBe(`n${MAX_BURST_COMMITS + 4}`)
  })

  it('ignores commits that were already there, e.g. after a refresh', () => {
    expect(newCommits(merged, merged)).toEqual([])
  })

  it('ignores loading more history', () => {
    const top = layoutGraph([commit('main1', ['root'])])
    expect(newCommits(top, before)).toEqual([])
  })

  it('ignores the first load and switching to another repo', () => {
    expect(newCommits([], merged)).toEqual([])
    const other = layoutGraph([commit('x', ['y']), commit('y', [])])
    expect(newCommits(other, merged)).toEqual([])
  })
})
