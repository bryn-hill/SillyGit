import { describe, expect, it } from 'vitest'
import { clickCommit, fixSelection, selectedHashes, stepSelection } from './selection'

const order = ['e', 'd', 'c', 'b', 'a']
const plain = { toggle: false, range: false }
const toggle = { toggle: true, range: false }
const range = { toggle: false, range: true }

describe('clickCommit', () => {
  it('selects a commit, and clears it on a second click', () => {
    const one = clickCommit({ type: 'working' }, 'c', plain, order)
    expect(one).toEqual({ type: 'commit', hash: 'c' })
    expect(clickCommit(one, 'c', plain, order)).toEqual({ type: 'none' })
  })

  it('a plain click collapses a multi-selection to one commit', () => {
    expect(clickCommit({ type: 'commits', hashes: ['d', 'b'], anchor: 'b' }, 'd', plain, order)).toEqual({
      type: 'commit',
      hash: 'd'
    })
  })

  it('cmd-click adds and removes commits, kept in graph order', () => {
    let s = clickCommit({ type: 'commit', hash: 'b' }, 'd', toggle, order)
    expect(s).toEqual({ type: 'commits', hashes: ['d', 'b'], anchor: 'd' })
    s = clickCommit(s, 'a', toggle, order)
    expect(selectedHashes(s)).toEqual(new Set(['d', 'b', 'a']))
    s = clickCommit(s, 'd', toggle, order)
    s = clickCommit(s, 'a', toggle, order)
    expect(s).toEqual({ type: 'commit', hash: 'b' })
    expect(clickCommit(s, 'b', toggle, order)).toEqual({ type: 'none' })
  })

  it('shift-click selects the range from the anchor, either direction', () => {
    expect(clickCommit({ type: 'commit', hash: 'd' }, 'b', range, order)).toEqual({
      type: 'commits',
      hashes: ['d', 'c', 'b'],
      anchor: 'd'
    })
    expect(clickCommit({ type: 'commit', hash: 'b' }, 'e', range, order)).toMatchObject({
      hashes: ['e', 'd', 'c', 'b']
    })
  })

  it('cmd-shift-click adds a range to the selection', () => {
    const s = clickCommit({ type: 'commits', hashes: ['e', 'a'], anchor: 'e' }, 'd', { toggle: true, range: true }, order)
    expect(s).toMatchObject({ hashes: ['e', 'd', 'a'] })
  })

  it('shift-click with nothing selected just selects the commit', () => {
    expect(clickCommit({ type: 'working' }, 'c', range, order)).toEqual({ type: 'commit', hash: 'c' })
  })
})

describe('fixSelection', () => {
  const has = (hash: string): boolean => order.includes(hash)

  it('leaves a selection that still exists alone', () => {
    const s = { type: 'commit', hash: 'c' } as const
    expect(fixSelection(s, has, 'e', false)).toBe(s)
    const w = { type: 'working' } as const
    expect(fixSelection(w, has, 'e', true)).toBe(w)
  })

  it('moves from the WIP row to the newest commit once the changes are gone', () => {
    expect(fixSelection({ type: 'working' }, has, 'e', false)).toEqual({ type: 'commit', hash: 'e' })
  })

  it('moves off a commit that went away', () => {
    expect(fixSelection({ type: 'commit', hash: 'x' }, has, 'e', false)).toEqual({ type: 'commit', hash: 'e' })
    expect(fixSelection({ type: 'commit', hash: 'x' }, has, 'e', true)).toEqual({ type: 'working' })
  })

  it('drops missing commits from a multi-selection', () => {
    expect(fixSelection({ type: 'commits', hashes: ['d', 'x', 'b'], anchor: 'x' }, has, 'e', false)).toEqual({
      type: 'commits',
      hashes: ['d', 'b'],
      anchor: 'd'
    })
    expect(fixSelection({ type: 'commits', hashes: ['x', 'b'], anchor: 'b' }, has, 'e', false)).toEqual({
      type: 'commit',
      hash: 'b'
    })
  })

  it('does nothing before the graph has loaded', () => {
    const s = { type: 'commit', hash: 'x' } as const
    expect(fixSelection(s, has, null, false)).toBe(s)
  })
})

describe('stepSelection', () => {
  it('moves from the WIP row into the commits and back', () => {
    expect(stepSelection({ type: 'working' }, order, true, 1)).toEqual({ type: 'commit', hash: 'e' })
    expect(stepSelection({ type: 'commit', hash: 'e' }, order, true, -1)).toEqual({ type: 'working' })
  })

  it('stops at the ends and starts at the top from nothing', () => {
    expect(stepSelection({ type: 'commit', hash: 'a' }, order, false, 1)).toEqual({ type: 'commit', hash: 'a' })
    expect(stepSelection({ type: 'none' }, order, false, 1)).toEqual({ type: 'commit', hash: 'e' })
    expect(stepSelection({ type: 'none' }, [], false, 1)).toBeNull()
  })

  it('steps from the anchor of a multi-selection', () => {
    expect(stepSelection({ type: 'commits', hashes: ['d', 'c'], anchor: 'c' }, order, false, 1)).toEqual({
      type: 'commit',
      hash: 'b'
    })
  })
})
