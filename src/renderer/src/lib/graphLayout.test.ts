import { describe, expect, it } from 'vitest'
import type { GraphCommit } from '../../../shared/types'
import { layoutGraph } from './graphLayout'

const commit = (hash: string, parents: string[]): GraphCommit =>
  ({ hash, parents, author: 'a', date: '', subject: hash, refs: [] })

describe('layoutGraph with merges of three or more branches', () => {
  // Newest first: an octopus merge M of a, b and c, all cut from root.
  const commits = [
    commit('M', ['main1', 'a', 'b', 'c']),
    commit('c', ['root']),
    commit('b', ['root']),
    commit('a', ['root']),
    commit('main1', ['root']),
    commit('root', [])
  ]
  const rows = layoutGraph(commits)

  it('gives each extra parent of an octopus merge its own lane', () => {
    const m = rows[0]
    expect(m.mergeParentLanes).toHaveLength(3)
    expect(new Set([m.lane, ...m.mergeParentLanes]).size).toBe(4)
  })

  it('places each parent on the lane its merge line points at', () => {
    const [m] = rows
    for (const [i, hash] of ['a', 'b', 'c'].entries()) {
      expect(rows.find((r) => r.commit.hash === hash)!.lane).toBe(m.mergeParentLanes[i])
    }
  })

  it('joins every lane back at the shared root', () => {
    const root = rows[rows.length - 1]
    expect(root.incomingLanes).toHaveLength(3)
    expect(root.after.filter((l) => l !== null)).toEqual([])
  })
})
