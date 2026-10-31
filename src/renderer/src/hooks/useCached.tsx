import { useCallback, useSyncExternalStore } from 'react'
import { hasCached, readCached, subscribeCached } from '../lib/swrCache'

const noop = (): void => {}

/**
 * The value cached under `key` (see lib/swrCache.ts), or `fallback` when
 * nothing is cached for it yet or `key` is null. Re-renders when it's written.
 * `fallback` should be a constant, so the snapshot stays the same between renders.
 */
export function useCached<T>(key: string | null, fallback: T): T {
  const subscribe = useCallback((listener: () => void) => (key ? subscribeCached(key, listener) : noop), [key])
  const snapshot = (): T => (key && hasCached(key) ? (readCached<T>(key) as T) : fallback)
  return useSyncExternalStore(subscribe, snapshot)
}
