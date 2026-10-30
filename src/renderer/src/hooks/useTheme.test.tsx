// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ThemePreference } from '../../../shared/theme'
import { useTheme } from './useTheme'

/** A prefers-color-scheme the test can flip, like the OS switching appearance. */
function fakeSystemTheme(dark: boolean): (dark: boolean) => void {
  const listeners = new Set<() => void>()
  const query = {
    get matches() {
      return dark
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
  }
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia
  return (next) => {
    dark = next
    listeners.forEach((listener) => listener())
  }
}

beforeEach(() => {
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('useTheme', () => {
  it('puts a fixed choice on <html> whatever the system says', () => {
    fakeSystemTheme(true)
    const { result, rerender } = renderHook(({ preference }) => useTheme(preference), {
      initialProps: { preference: 'light' as ThemePreference }
    })
    expect(result.current).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')

    rerender({ preference: 'dark' })
    expect(result.current).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('follows the system as it changes when set to system', () => {
    const setSystemDark = fakeSystemTheme(false)
    const { result } = renderHook(() => useTheme('system'))
    expect(result.current).toBe('light')

    act(() => setSystemDark(true))
    expect(result.current).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
