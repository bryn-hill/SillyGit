import { describe, expect, it } from 'vitest'
import { clickCommit, selectedHashes } from './selection'

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
