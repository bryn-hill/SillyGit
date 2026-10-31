/**
 * Stale-while-revalidate store for per-repo results (CI checks, conflict
 * warnings, pull requests and so on). Each hook still asks for fresh data
 * whenever it used to, but it writes the answer here under a key that names
 * the repo, so switching back to a tab shows what that repo last showed
 * straight away instead of blanking until the new answer lands.
 *
 * Plain module state, shared by every hook in the window. Read it through
 * `useCached` (hooks/useCached.tsx) so components re-render on writes.
 */

// Oldest keys go first once there are this many (about 10 per open repo).
const MAX_ENTRIES = 400

const values = new Map<string, unknown>()
const listeners = new Map<string, Set<() => void>>()

/** The key for `kind` of result in `repoPath`. */
export function cacheKey(kind: string, repoPath: string): string {
  return `${kind}\u0000${repoPath}`
}

export function hasCached(key: string): boolean {
  return values.has(key)
}

/** The cached value, or `undefined` when nothing is cached yet. */
export function readCached<T>(key: string): T | undefined {
  return values.get(key) as T | undefined
}

/** Stores `value` under `key` and re-renders whoever reads it. */
export function writeCached<T>(key: string, value: T): void {
  if (values.has(key) && Object.is(values.get(key), value)) return
  values.delete(key)
  values.set(key, value)
  while (values.size > MAX_ENTRIES) {
    const oldest = values.keys().next().value as string
    values.delete(oldest)
  }
  for (const listener of listeners.get(key) ?? []) listener()
}

/** Writes `update(previous)`, where previous is `undefined` when nothing was cached. */
export function updateCached<T>(key: string, update: (previous: T | undefined) => T): void {
  writeCached(key, update(readCached<T>(key)))
}

export function subscribeCached(key: string, listener: () => void): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(key)
  }
}

/** Empties the store. For tests. */
export function clearCached(): void {
  values.clear()
}
