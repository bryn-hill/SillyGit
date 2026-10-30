import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_PREFERENCE, normalizeThemePreference, resolveTheme, windowBackground } from './theme'

describe('normalizeThemePreference', () => {
  it('keeps a known choice', () => {
    expect(normalizeThemePreference('system')).toBe('system')
    expect(normalizeThemePreference('light')).toBe('light')
    expect(normalizeThemePreference('dark')).toBe('dark')
  })

  it('falls back to dark for anything else, so updating keeps the old look', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('dark')
    expect(normalizeThemePreference(undefined)).toBe('dark')
    expect(normalizeThemePreference('solarized')).toBe('dark')
    expect(normalizeThemePreference(1)).toBe('dark')
  })
})

describe('resolveTheme', () => {
  it('follows the system only when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('windowBackground', () => {
  it('differs per theme', () => {
    expect(windowBackground('dark')).not.toBe(windowBackground('light'))
  })
})
