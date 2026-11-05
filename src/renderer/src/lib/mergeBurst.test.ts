import { describe, expect, it } from 'vitest'
import type { GraphCommit } from '../../../shared/types'
import { layoutGraph } from './graphLayout'
import { MAX_BURST_COMMITS, newCommits, planBurst, traceEdges } from './mergeBurst'

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

describe('traceEdges', () => {
  it('follows a new branch down its lane and curves into the commit it forked from', () => {
    // feat2 sits two rows above main1 in a lane of its own, then joins it.
    const rows = layoutGraph([
      commit('main2', ['main1']),
      commit('feat2', ['main1']),
      commit('other', ['main1']),
      commit('main1', ['root']),
      commit('root', [])
    ])
    const [edge] = traceEdges(rows, 1)
    expect(edge.segments.map((s) => s.kind)).toEqual(['own-bottom', 'pass', 'in'])
    expect(edge.segments.at(-1)).toMatchObject({ row: 2, from: 1, to: 0 })
  })

  it('ends in the parent own lane when the commit sits straight above it', () => {
    const rows = layoutGraph([commit('c', ['main1']), commit('main1', ['root']), commit('root', [])])
    expect(traceEdges(rows, 0)[0].segments).toEqual([
      { kind: 'own-bottom', row: 0, lane: 0 },
      { kind: 'own-top', row: 1, lane: 0 }
    ])
  })

  it('traces both parents of a merge', () => {
    const edges = traceEdges(merged, 0)
    expect(edges).toHaveLength(2)
    expect(edges[1].segments[0].kind).toBe('out')
    expect(edges[1].segments.at(-1)?.row).toBe(2)
  })

  it('holds back the pieces of the rows below that the line grows along', () => {
    const rows = layoutGraph([commit('c', ['main1']), commit('main1', ['root']), commit('root', [])])
    const plan = planBurst(rows, new Map([['c', 90]]))
    expect(plan.held.get('main1')).toEqual(new Map([['own-top', 90]]))
    expect(plan.held.has('c')).toBe(false)
  })
})
