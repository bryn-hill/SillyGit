import { useEffect, useEffectEvent, useState } from 'react'

/**
 * A value read for each repo as it opens (its favourite branches, its Run
 * command). It's `fallback` until it has loaded for the repo showing, so one
 * repo's value never shows under another's name.
 */
export function useRepoValue<T>(
  repoPath: string | null,
  load: (repoPath: string) => Promise<T>,
  fallback: T
): [T, (repoPath: string, value: T) => void] {
  const [saved, setSaved] = useState<{ repo: string; value: T } | null>(null)
  const read = useEffectEvent((repo: string) => load(repo))
  useEffect(() => {
    if (!repoPath) return
    let current = true
    read(repoPath).then((value) => {
      if (current) setSaved({ repo: repoPath, value })
    })
    return () => {
      current = false
    }
  }, [repoPath])
  const value = saved && saved.repo === repoPath ? saved.value : fallback
  const set = (repo: string, next: T): void => setSaved({ repo, value: next })
  return [value, set]
}
