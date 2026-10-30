import { describe, expect, it } from 'vitest'
import { groupStacks, wouldLoop } from './stacks'

describe('groupStacks', () => {
  it('groups branches under the bottom branch that sits on the trunk, children after their parent', () => {
    const parents = { a: 'main', b: 'a', c: 'a', d: 'b', x: 'develop' }
    const stacks = groupStacks(parents, new Set(['main', 'develop', 'a', 'b', 'c', 'd', 'x']))
    expect(stacks.map((s) => [s.id, s.trunk, s.nodes.map((n) => `${n.name}@${n.depth}`)])).toEqual([
      ['a', 'main', ['a@0', 'b@1', 'd@2', 'c@1']],
      ['x', 'develop', ['x@0']]
    ])
  })

  it('makes a branch whose parent is gone the bottom of its own stack, and skips loops', () => {
    const stacks = groupStacks({ a: 'gone', b: 'c', c: 'b' }, new Set(['a', 'b', 'c']))
    expect(stacks.map((s) => s.id)).toEqual(['a'])
  })

  it('spots a parent that would loop back', () => {
    expect(wouldLoop({ b: 'a', c: 'b' }, 'a', 'c')).toBe(true)
    expect(wouldLoop({ b: 'a' }, 'c', 'b')).toBe(false)
  })
})
