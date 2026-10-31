import { useEffect } from 'react'
import type { StackInfo } from '../../../shared/stacks'
import { cacheKey, writeCached } from '../lib/swrCache'
import { useCached } from './useCached'

const NO_STACKS: StackInfo[] = []

/**
 * The repo's stacked branches, reloaded whenever `refreshKey` changes (each
 * repo refresh). Cached per repo, so they show at once when you switch back
 * to a tab; another repo's stacks never show while this one's load.
 */
export function useStacks(repoPath: string | null, refreshKey: unknown): StackInfo[] {
  const stacks = useCached(repoPath ? cacheKey('stacks', repoPath) : null, NO_STACKS)
  useEffect(() => {
    if (!repoPath) return
    let current = true
    window.api.stacks(repoPath).then((res) => {
      if (current) writeCached(cacheKey('stacks', repoPath), res.ok ? res.data : NO_STACKS)
    })
    return () => {
      current = false
    }
  }, [repoPath, refreshKey])
  return stacks
}
