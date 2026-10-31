import { useCallback, useEffect, useRef } from 'react'
import type { OpenPullRequest } from '../../../shared/types'
import { cacheKey, writeCached } from '../lib/swrCache'
import { useCached } from './useCached'

const NONE: OpenPullRequest[] = []

/**
 * The repo's open pull requests, which come from GitHub via gh and take a
 * second or two. Stale-while-revalidate: the branch menu shows the cached list
 * straight away, and opening it (or focusing the window) calls `revalidate`
 * to refetch in the background, so the menu updates in place if anything changed.
 * The list is cached per repo, so it's there at once when you switch back to a tab.
 */
export function usePullRequests(repoPath: string | null): [OpenPullRequest[], () => void] {
  const list = useCached(repoPath ? cacheKey('pull-requests', repoPath) : null, NONE)
  const prFetch = useRef({ inFlight: false })
  const revalidate = useCallback(() => {
    const state = prFetch.current
    if (!repoPath || state.inFlight) return
    state.inFlight = true
    window.api.openPullRequests(repoPath).then((res) => {
      state.inFlight = false
      // The answer is for repoPath, so it's cached even if another tab is showing now.
      if (res.ok) writeCached(cacheKey('pull-requests', repoPath), res.data)
    })
  }, [repoPath])

  useEffect(() => {
    prFetch.current = { inFlight: false }
    revalidate()
    window.addEventListener('focus', revalidate)
    return () => window.removeEventListener('focus', revalidate)
  }, [revalidate])

  return [list, revalidate]
}
