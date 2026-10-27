import { describe, expect, it } from 'vitest'
import { initials, initialsColor } from './avatars'

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('Ada King Lovelace')).toBe('AL')
    expect(initials('octocat')).toBe('O')
  })

  it('splits on dots, dashes and underscores too', () => {
    expect(initials('bryn.hill')).toBe('BH')
    expect(initials('renovate-bot')).toBe('RB')
    expect(initials('first_last')).toBe('FL')
  })

  it("doesn't cut an emoji or accented letter in half", () => {
    expect(initials('🦊 fox')).toBe('🦊F')
    expect(initials('élodie ünal')).toBe('ÉÜ')
  })

  it('falls back to a question mark for a blank name', () => {
    expect(initials('')).toBe('?')
    expect(initials('  -- ')).toBe('?')
  })
})

describe('initialsColor', () => {
  it('is the same for the same person, whatever the case', () => {
    expect(initialsColor('Ada@Example.com')).toBe(initialsColor('ada@example.com'))
  })

  it('is an hsl colour with a hue in range', () => {
    for (const seed of ['', 'a', 'someone@example.com', 'x'.repeat(500)]) {
      const match = /^hsl\((\d+), 45%, 42%\)$/.exec(initialsColor(seed))
      expect(match).not.toBeNull()
      expect(Number(match![1])).toBeLessThan(360)
    }
  })

  it('spreads different people over different colours', () => {
    const colours = new Set(['ada', 'bryn', 'claude', 'grace', 'linus', 'margaret'].map(initialsColor))
    expect(colours.size).toBeGreaterThan(3)
  })
})
