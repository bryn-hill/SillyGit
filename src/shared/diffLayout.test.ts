import { describe, expect, it } from 'vitest'
import { normalizeDiffLayout } from './diffLayout'

describe('normalizeDiffLayout', () => {
  it('keeps a known layout', () => {
    expect(normalizeDiffLayout('split')).toBe('split')
    expect(normalizeDiffLayout('unified')).toBe('unified')
  })

  it('falls back to unified for anything else', () => {
    expect(normalizeDiffLayout(undefined)).toBe('unified')
    expect(normalizeDiffLayout('sideways')).toBe('unified')
  })
})
