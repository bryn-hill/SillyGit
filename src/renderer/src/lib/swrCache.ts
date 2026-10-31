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

// Oldest keys of a kind go first once it has this many, so browsing many
// commits' details never pushes out the CI results of an open tab.
const MAX_PER_KIND = 200

const values = new Map<string, unknown>()
const listeners = new Map<string, Set<() => void>>()

/** The key for `kind` of result in `repoPath`, optionally narrowed to one `item` (a commit, say). */
export function cacheKey(kind: string, repoPath: string, item?: string): string {
  return item === undefined ? `${kind}\u0000${repoPath}` : `${kind}\u0000${repoPath}\u0000${item}`
}

const kindOf = (key: string): string => key.slice(0, key.indexOf('\u0000'))

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
  const kind = kindOf(key)
  let ofKind = 0
  for (const k of values.keys()) if (kindOf(k) === kind) ofKind++
  // Map keys run oldest first, so this drops the least recently written.
  for (const k of values.keys()) {
    if (ofKind <= MAX_PER_KIND) break
    if (kindOf(k) === kind && k !== key) {
      values.delete(k)
      ofKind--
    }
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
