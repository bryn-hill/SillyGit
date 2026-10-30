import { describe, expect, it, vi } from 'vitest'
import { isPrimary, isTyping, matchScore, ownsModifierKeys } from './shortcuts'

// Node has a navigator of its own that reports macOS on a Mac, so hide it and test the non-macOS (Ctrl) bindings.
vi.hoisted(() => vi.stubGlobal('navigator', undefined))
const key = (mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>>): KeyboardEvent =>
  ({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent

describe('isPrimary', () => {
  it('wants Ctrl alone, or Ctrl+Shift when asked', () => {
    expect(isPrimary(key({ ctrlKey: true }))).toBe(true)
    expect(isPrimary(key({ ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isPrimary(key({ ctrlKey: true, shiftKey: true }), true)).toBe(true)
    expect(isPrimary(key({ ctrlKey: true }), true)).toBe(false)
  })

  it('rejects other modifiers', () => {
    expect(isPrimary(key({}))).toBe(false)
    expect(isPrimary(key({ metaKey: true }))).toBe(false)
    expect(isPrimary(key({ ctrlKey: true, metaKey: true }))).toBe(false)
    expect(isPrimary(key({ ctrlKey: true, altKey: true }))).toBe(false)
  })
})

describe('isTyping', () => {
  const target = (insideField: boolean): EventTarget =>
    ({ closest: (selector: string) => (insideField && selector.includes('textarea') ? {} : null) }) as unknown as EventTarget

  it('is true inside a text field and false elsewhere', () => {
    expect(isTyping(target(true))).toBe(true)
    expect(isTyping(target(false))).toBe(false)
  })

  it('copes with targets that are not elements', () => {
    expect(isTyping(null)).toBe(false)
    expect(isTyping({} as EventTarget)).toBe(false)
  })
})

describe('ownsModifierKeys', () => {
  const inside = (selector: string): EventTarget =>
    ({ closest: (s: string) => (s.split(', ').includes(selector) ? {} : null) }) as unknown as EventTarget

  it('is true in the terminal and the built-in editor only', () => {
    expect(ownsModifierKeys(inside('.xterm'))).toBe(true)
    expect(ownsModifierKeys(inside('.monaco-editor'))).toBe(true)
    expect(ownsModifierKeys(inside('textarea'))).toBe(false)
    expect(ownsModifierKeys(null)).toBe(false)
  })
})

describe('matchScore', () => {
  it('matches when every word appears, in any order', () => {
    expect(matchScore('Branch: Checkout feature/login', 'login checkout')).not.toBeNull()
    expect(matchScore('Push', 'pull')).toBeNull()
    expect(matchScore('Fetch all', 'fetch xyz')).toBeNull()
  })

  it('ranks earlier and word-start matches first', () => {
    const early = matchScore('Pull', 'pu')!
    const later = matchScore('Open pull request', 'pu')!
    const midWord = matchScore('Compute', 'pu')!
    expect(early).toBeLessThan(later)
    expect(later).toBeLessThan(midWord)
  })

  it('treats path and punctuation separators as word starts', () => {
    expect(matchScore('origin/main', 'main')).toBe(7)
    expect(matchScore('fix_bug', 'bug')).toBe(4)
  })

  it('scores an empty query as a match for everything', () => {
    expect(matchScore('Anything', '   ')).toBe(0)
  })

  it('ignores case', () => {
    expect(matchScore('Create Branch', 'BRANCH')).toBe(7)
  })
})
