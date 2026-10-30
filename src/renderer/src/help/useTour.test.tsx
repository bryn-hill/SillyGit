// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HelpSettings, TourStep } from '../../../shared/help/types'
import { TOUR_VERSION } from '../../../shared/help/tour'
import { startTour } from './tourBus'
import { useTour } from './useTour'

const steps: TourStep[] = [
  { id: 'one', title: 'One', body: '' },
  { id: 'two', title: 'Two', body: '' },
  { id: 'three', title: 'Three', body: '' }
]

let saved: HelpSettings
const setHelpSettings = vi.fn(async (next: HelpSettings) => {
  saved = next
  return { ok: true as const, data: next }
})

beforeEach(() => {
  saved = { tourCompleted: false, tourVersion: 0 }
  setHelpSettings.mockClear()
  ;(window as unknown as { api: unknown }).api = {
    getHelpSettings: async () => saved,
    setHelpSettings
  }
})

async function loaded(repoOpen: boolean) {
  const hook = renderHook(({ open }) => useTour(open, steps), { initialProps: { open: repoOpen } })
  await act(async () => {})
  return hook
}

describe('useTour', () => {
  it('starts by itself on first use, once a repo is open', async () => {
    const { result, rerender } = await loaded(false)
    expect(result.current.step).toBeNull()
    rerender({ open: true })
    expect(result.current.step?.id).toBe('one')
    expect(result.current.count).toBe(3)
  })

  it('steps forward and back, and finishing remembers it', async () => {
    const { result } = await loaded(true)
    act(() => result.current.next())
    expect(result.current.step?.id).toBe('two')
    act(() => result.current.back())
    act(() => result.current.back())
    expect(result.current.step?.id).toBe('one')
    act(() => result.current.next())
    act(() => result.current.next())
    expect(result.current.step?.id).toBe('three')
    act(() => result.current.next())
    expect(result.current.step).toBeNull()
    expect(setHelpSettings).toHaveBeenCalledWith({ tourCompleted: true, tourVersion: TOUR_VERSION })
  })

  it('skipping also counts as seen, so it does not come back', async () => {
    const { result, unmount } = await loaded(true)
    act(() => result.current.next())
    act(() => result.current.close())
    expect(result.current.step).toBeNull()
    expect(saved).toEqual({ tourCompleted: true, tourVersion: TOUR_VERSION })
    unmount()
    const again = await loaded(true)
    expect(again.result.current.step).toBeNull()
  })

  it('restarts from the first step when asked', async () => {
    saved = { tourCompleted: true, tourVersion: TOUR_VERSION }
    const { result } = await loaded(true)
    expect(result.current.step).toBeNull()
    act(() => startTour())
    expect(result.current.step?.id).toBe('one')
    act(() => result.current.next())
    act(() => result.current.close())
    act(() => startTour())
    await waitFor(() => expect(result.current.step?.id).toBe('one'))
  })

  it('shows again when the tour has a newer version than the one seen', async () => {
    saved = { tourCompleted: true, tourVersion: TOUR_VERSION - 1 }
    const { result } = await loaded(true)
    expect(result.current.step?.id).toBe('one')
  })
})
