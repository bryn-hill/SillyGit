// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRepo } from './useRepo'

const ok = <T,>(data: T): Promise<{ ok: true; data: T }> => Promise.resolve({ ok: true, data })

function status(file: string | null) {
  return { branch: 'main', staged: [], unstaged: file ? [{ path: file, status: 'M' }] : [], conflicted: [] }
}

/** window.api with getStatus answered by hand, in whatever order a test likes. */
function fakeApi() {
  const pending: ((value: unknown) => void)[] = []
  window.api = {
    getStatus: vi.fn(() => new Promise((resolve) => pending.push(resolve))),
    branches: () => ok([]),
    graphLog: () => ok([]),
    operationState: () => ok(null),
    bisectState: () => ok(null),
    remotes: () => ok([]),
    stashes: () => ok([]),
    undoLabel: () => ok(null),
    redoLabel: () => ok(null),
    watchRepo: () => Promise.resolve(),
    onRepoChanged: () => () => {}
  } as unknown as typeof window.api
  return { answer: (i: number, file: string | null) => pending[i]({ ok: true, data: status(file) }) }
}

afterEach(() => {
  delete (window as { api?: unknown }).api
})

describe('useRepo refresh', () => {
  it('waits for a newer overlapping refresh, so the caller sees the newer state', async () => {
    const api = fakeApi()
    // onError must be stable, or every render refreshes again.
    const onError = (): void => {}
    const { result } = renderHook(() => useRepo({ onError, autoFetchMinutes: null }))
    act(() => {
      result.current.show('/repo')
    })
    // The refresh from opening the repo.
    await act(async () => api.answer(0, null))

    // A command's own refresh, then a watcher's refresh that overtakes it.
    let done = false
    let first!: Promise<void>
    act(() => {
      first = result.current.refresh('/repo').then(() => {
        done = true
      })
      void result.current.refresh('/repo')
    })
    await act(async () => api.answer(1, 'stale.txt'))
    expect(done).toBe(false)
    expect(result.current.status?.unstaged).toEqual([])

    await act(async () => {
      api.answer(2, 'notes.txt')
      await first
    })
    expect(result.current.status?.unstaged).toEqual([{ path: 'notes.txt', status: 'M' }])
  })
})

describe('useRepo graph filter', () => {
  it('reads the graph with the filter, keeps it on refresh and drops it when cleared', async () => {
    const graphLog = vi.fn((_path: string, _limit: number, filter: { path: string } | null) =>
      ok(filter ? [{ hash: 'f', parents: [], refs: [], subject: 'filtered' }] : [])
    )
    window.api = {
      getStatus: () => ok(status(null)),
      branches: () => ok([]),
      graphLog,
      operationState: () => ok(null),
      remotes: () => ok([]),
      stashes: () => ok([]),
      undoLabel: () => ok(null),
      redoLabel: () => ok(null),
      watchRepo: () => Promise.resolve(),
      onRepoChanged: () => () => {}
    } as unknown as typeof window.api
    const onError = (): void => {}
    const { result } = renderHook(() => useRepo({ onError, autoFetchMinutes: null }))
    await act(async () => {
      result.current.show('/repo')
    })

    await act(() => result.current.setGraphFilter({ path: 'src' }))
    expect(result.current.graphFilter).toEqual({ path: 'src' })
    expect(result.current.graphRows.map((r) => r.commit.subject)).toEqual(['filtered'])

    await act(() => result.current.refresh('/repo'))
    expect(graphLog).toHaveBeenLastCalledWith('/repo', 500, { path: 'src' })
    expect(result.current.graphRows).toHaveLength(1)

    await act(() => result.current.setGraphFilter(null))
    expect(graphLog).toHaveBeenLastCalledWith('/repo', 500, null)
    expect(result.current.graphRows).toHaveLength(0)
  })
})
