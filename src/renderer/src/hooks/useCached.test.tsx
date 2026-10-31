// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CiStatusMap } from '../../../shared/ciStatus'
import type { ConflictForecast } from '../../../shared/conflictForecast'
import type { BranchInfo } from '../../../shared/types'
import { useCiStatus } from '../components/commitGraph/useCiStatus'
import { cacheKey, clearCached, hasCached, writeCached } from '../lib/swrCache'
import { useCached } from './useCached'
import { useConflictForecast } from './useConflictForecast'

/** A promise the test resolves when it likes, like an IPC answer still on its way. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

afterEach(() => {
  clearCached()
  delete (window as { api?: unknown }).api
})

describe('useCached', () => {
  it('shows the fallback until a value is written, then re-renders with it', () => {
    const fallback: string[] = []
    const { result } = renderHook(() => useCached(cacheKey('test', '/a'), fallback))
    expect(result.current).toBe(fallback)
    act(() => writeCached(cacheKey('test', '/a'), ['x']))
    expect(result.current).toEqual(['x'])
  })

  it('keeps each repo apart', () => {
    writeCached(cacheKey('test', '/a'), 'a')
    const { result, rerender } = renderHook(({ repo }) => useCached(cacheKey('test', repo), 'none'), {
      initialProps: { repo: '/a' }
    })
    expect(result.current).toBe('a')
    rerender({ repo: '/b' })
    expect(result.current).toBe('none')
  })
})

describe('swrCache', () => {
  it('drops the oldest of a kind past its limit, leaving other kinds alone', () => {
    writeCached(cacheKey('ci-status', '/a'), {})
    for (let i = 0; i < 250; i++) writeCached(cacheKey('commit-detail', '/a', String(i)), i)
    expect(hasCached(cacheKey('ci-status', '/a'))).toBe(true)
    expect(hasCached(cacheKey('commit-detail', '/a', '0'))).toBe(false)
    expect(hasCached(cacheKey('commit-detail', '/a', '249'))).toBe(true)
  })
})

const failed = { state: 'failure' } as unknown as CiStatusMap[string]

describe('switching tabs', () => {
  it('shows the last CI results for a repo straight away while they load again', async () => {
    const answers: Record<string, ReturnType<typeof deferred<{ ok: true; data: CiStatusMap }>>[]> = { '/a': [], '/b': [] }
    window.api = {
      ciStatuses: vi.fn((repo: string) => {
        const answer = deferred<{ ok: true; data: CiStatusMap }>()
        answers[repo].push(answer)
        return answer.promise
      })
    } as unknown as typeof window.api

    const { result, rerender } = renderHook(({ repo }) => useCiStatus(repo, ['abc'], 0), { initialProps: { repo: '/a' } })
    await act(async () => answers['/a'][0].resolve({ ok: true, data: { abc: failed } }))
    expect(result.current.statuses.abc).toBe(failed)

    rerender({ repo: '/b' })
    expect(result.current.statuses).toEqual({})

    // Back on the first tab: the failed run shows before the new answer lands.
    rerender({ repo: '/a' })
    expect(answers['/a']).toHaveLength(2)
    expect(result.current.statuses.abc).toBe(failed)
  })

  it('keeps conflict warnings up for a repo when you come back to it', async () => {
    const forecast = { feature: { target: 'main', files: ['a.ts'] } } as unknown as ConflictForecast
    // The new answer never lands, so only the cached one can show.
    window.api = { conflictForecast: vi.fn(() => new Promise(() => {})) } as unknown as typeof window.api
    writeCached(cacheKey('conflict-forecast', '/a'), forecast)
    const branches = [{ name: 'feature', sha: '1', remote: false }] as unknown as BranchInfo[]

    const { result, rerender } = renderHook(({ repo }) => useConflictForecast(repo, branches, true), {
      initialProps: { repo: '/b' }
    })
    expect(result.current).toEqual({})
    rerender({ repo: '/a' })
    expect(result.current).toBe(forecast)
  })
})
