import { useCallback, useEffect, useRef, useState } from 'react'
import type { OpenPullRequest } from '../../../shared/types'

const NONE: OpenPullRequest[] = []

/**
 * The repo's open pull requests, which come from GitHub via gh and take a
 * second or two. Stale-while-revalidate: the branch menu shows the cached list
 * straight away, and opening it (or focusing the window) calls `revalidate`
 * to refetch in the background, so the menu updates in place if anything changed.
 */
export function usePullRequests(repoPath: string | null): [OpenPullRequest[], () => void] {
  const [fetched, setFetched] = useState<{ repo: string; list: OpenPullRequest[] } | null>(null)
  const prFetch = useRef<{ repo: string | null; inFlight: boolean }>({ repo: null, inFlight: false })
  const revalidate = useCallback(() => {
    const state = prFetch.current
    if (!repoPath || state.inFlight) return
    state.repo = repoPath
    state.inFlight = true
    window.api.openPullRequests(repoPath).then((res) => {
      state.inFlight = false
      // Ignore a late answer for a repo that's no longer open.
      if (res.ok && prFetch.current.repo === repoPath) setFetched({ repo: repoPath, list: res.data })
    })
  }, [repoPath])

  useEffect(() => {
    prFetch.current = { repo: null, inFlight: false }
    revalidate()
    window.addEventListener('focus', revalidate)
    return () => window.removeEventListener('focus', revalidate)
  }, [revalidate])

  return [fetched && fetched.repo === repoPath ? fetched.list : NONE, revalidate]
}
