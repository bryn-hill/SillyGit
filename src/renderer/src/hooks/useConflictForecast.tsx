import { useEffect, useState } from 'react'
import { forecastKey, type ConflictForecast } from '../../../shared/conflictForecast'
import type { BranchInfo } from '../../../shared/types'

const NONE: ConflictForecast = {}

/**
 * Which local branches would conflict with the default branch or the current
 * one. Asks again only when a branch tip moves; the main process caches each
 * trial merge, so that's cheap. The last answer for the repo stays up while a
 * new one loads, so tags don't flicker on every refresh.
 */
export function useConflictForecast(repoPath: string, branches: BranchInfo[], enabled: boolean): ConflictForecast {
  const key = forecastKey(branches)
  const [saved, setSaved] = useState<{ repo: string; forecast: ConflictForecast } | null>(null)
  useEffect(() => {
    if (!enabled || !key) return
    let current = true
    window.api.conflictForecast(repoPath).then((res) => {
      if (current) setSaved({ repo: repoPath, forecast: res.ok && res.data ? res.data : NONE })
    })
    return () => {
      current = false
    }
  }, [repoPath, key, enabled])
  return enabled && saved?.repo === repoPath ? saved.forecast : NONE
}
