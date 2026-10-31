import { useEffect } from 'react'
import { forecastKey, type ConflictForecast } from '../../../shared/conflictForecast'
import type { BranchInfo } from '../../../shared/types'
import { cacheKey, writeCached } from '../lib/swrCache'
import { useCached } from './useCached'

const NONE: ConflictForecast = {}

/**
 * Which local branches would conflict with the default branch or the current
 * one. Asks again only when a branch tip moves; the main process caches each
 * trial merge, so that's cheap. Stale-while-revalidate: each repo's last
 * answer is cached, so tags show straight away when you switch back to its
 * tab and don't flicker while a new answer loads.
 */
export function useConflictForecast(repoPath: string, branches: BranchInfo[], enabled: boolean): ConflictForecast {
  const key = forecastKey(branches)
  const cached = useCached(cacheKey('conflict-forecast', repoPath), NONE)
  useEffect(() => {
    if (!enabled || !key) return
    let current = true
    window.api.conflictForecast(repoPath).then((res) => {
      if (current) writeCached(cacheKey('conflict-forecast', repoPath), res.ok && res.data ? res.data : NONE)
    })
    return () => {
      current = false
    }
  }, [repoPath, key, enabled])
  return enabled ? cached : NONE
}
