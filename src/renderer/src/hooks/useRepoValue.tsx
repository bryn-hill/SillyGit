import { useEffect, useEffectEvent } from 'react'
import { cacheKey, writeCached } from '../lib/swrCache'
import { useCached } from './useCached'

/**
 * A value read for each repo as it opens (its favourite branches, its Run
 * command). It's `fallback` until it has first loaded for the repo showing,
 * so one repo's value never shows under another's name. After that it's
 * cached under `name` (stale-while-revalidate), so switching back to a tab
 * shows the repo's value at once while it's read again.
 */
export function useRepoValue<T>(
  name: string,
  repoPath: string | null,
  load: (repoPath: string) => Promise<T>,
  fallback: T
): [T, (repoPath: string, value: T) => void] {
  const value = useCached(repoPath ? cacheKey(name, repoPath) : null, fallback)
  const read = useEffectEvent((repo: string) => load(repo))
  useEffect(() => {
    if (!repoPath) return
    let current = true
    read(repoPath).then((next) => {
      if (current) writeCached(cacheKey(name, repoPath), next)
    })
    return () => {
      current = false
    }
  }, [name, repoPath])
  const set = (repo: string, next: T): void => writeCached(cacheKey(name, repo), next)
  return [value, set]
}
