import { describe, expect, it } from 'vitest'
import { cycleTab, moveTab, openTab, tabAfterClosing, tabForDigit, togglePinnedTab } from './tabs'

describe('openTab', () => {
  it('adds a new repo at the end and leaves an open one where it is', () => {
    expect(openTab(['a', 'b'], 'c', 'a', false)).toEqual(['a', 'b', 'c'])
    const tabs = ['a', 'b']
    expect(openTab(tabs, 'b', 'a', true)).toBe(tabs)
  })

  it('replaces the active tab when asked', () => {
    expect(openTab(['a', 'b', 'c'], 'x', 'b', true)).toEqual(['a', 'x', 'c'])
    expect(openTab(['a'], 'x', null, true)).toEqual(['a', 'x'])
  })
})

describe('tabAfterClosing', () => {
  it('prefers the tab to the right, then the left, like a browser', () => {
    expect(tabAfterClosing(['a', 'b', 'c'], 'b', ['b'])).toBe('c')
    expect(tabAfterClosing(['a', 'b', 'c'], 'c', ['c'])).toBe('b')
    expect(tabAfterClosing(['a', 'b', 'c', 'd'], 'b', ['b', 'c'])).toBe('d')
    expect(tabAfterClosing(['a', 'b', 'c'], 'c', ['b', 'c'])).toBe('a')
    expect(tabAfterClosing(['a'], 'a', ['a'])).toBeNull()
  })
})

describe('togglePinnedTab', () => {
  it('moves a pinned tab to the end of the pinned group', () => {
    expect(togglePinnedTab(['p', 'a', 'b'], ['p'], 'b')).toEqual({ pinned: ['p', 'b'], tabs: ['p', 'b', 'a'] })
  })

  it('moves an unpinned tab to the start of the rest', () => {
    expect(togglePinnedTab(['p', 'q', 'a'], ['p', 'q'], 'p')).toEqual({ pinned: ['q'], tabs: ['q', 'p', 'a'] })
  })
})

describe('moveTab', () => {
  it('moves a tab before another', () => {
    expect(moveTab(['a', 'b', 'c'], [], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('moves a tab to the end of its own group', () => {
    expect(moveTab(['p', 'q', 'a', 'b'], ['p', 'q'], 'p', null)).toEqual(['q', 'p', 'a', 'b'])
    expect(moveTab(['p', 'a', 'b'], ['p'], 'a', null)).toEqual(['p', 'b', 'a'])
  })
})

describe('cycleTab', () => {
  it('wraps around both ways', () => {
    expect(cycleTab(['a', 'b', 'c'], 'c', 1)).toBe('a')
    expect(cycleTab(['a', 'b', 'c'], 'a', -1)).toBe('c')
    expect(cycleTab(['a', 'b'], null, 1)).toBe('a')
    expect(cycleTab([], null, 1)).toBeNull()
  })
})

describe('tabForDigit', () => {
  it('picks that tab, and 9 the last one', () => {
    expect(tabForDigit(['a', 'b', 'c'], 2)).toBe('b')
    expect(tabForDigit(['a', 'b', 'c'], 9)).toBe('c')
    expect(tabForDigit(['a'], 4)).toBeUndefined()
  })
})
