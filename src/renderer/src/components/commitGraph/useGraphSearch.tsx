import { useEffect, useEffectEvent, useMemo, useState, type RefObject } from 'react'
import type { CommitSearchHit } from '../../../../shared/types'

interface GraphSearch {
  query: string
  changeQuery: (next: string) => void
  /** The matches, or null with no search running. */
  hits: CommitSearchHit[] | null
  hitIndex: number
  hitSet: Set<string> | null
  /** Moves to the next (1) or previous (-1) match, wrapping round. */
  stepHit: (delta: number) => void
}

/** The graph's search box: searches as the query changes and jumps to the first match. */
export function useGraphSearch({
  repoPath,
  searchRef,
  searchFocusToken,
  onJumpToCommit
}: {
  repoPath: string
  searchRef: RefObject<HTMLInputElement | null>
  /** Focuses the search box whenever it changes (from 0). */
  searchFocusToken: number
  onJumpToCommit: (hit: CommitSearchHit) => void
}): GraphSearch {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<CommitSearchHit[] | null>(null)
  const hits = query.trim() ? found : null
  const [hitIndex, setHitIndex] = useState(0)
  const hitSet = useMemo(() => (hits ? new Set(hits.map((h) => h.hash)) : null), [hits])

  useEffect(() => {
    if (searchFocusToken === 0) return
    searchRef.current?.focus()
    searchRef.current?.select()
  }, [searchFocusToken, searchRef])

  const jumpToFirstHit = useEffectEvent((hit: CommitSearchHit) => onJumpToCommit(hit))

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let cancelled = false
    const timer = setTimeout(() => {
      window.api.searchCommits(repoPath, q).then((res) => {
        if (cancelled) return
        const results = res.ok ? res.data : []
        setFound(results)
        setHitIndex(0)
        if (results.length > 0) jumpToFirstHit(results[0])
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, repoPath])

  const changeQuery = (next: string): void => {
    setQuery(next)
    // Don't flash the last search's results when a new one starts from empty.
    if (!next.trim()) setFound(null)
  }

  const stepHit = (delta: number): void => {
    if (!hits || hits.length === 0) return
    const next = (hitIndex + delta + hits.length) % hits.length
    setHitIndex(next)
    onJumpToCommit(hits[next])
  }

  return { query, changeQuery, hits, hitIndex, hitSet, stepHit }
}
