import { useEffect, useEffectEvent, useMemo, useState, type RefObject } from 'react'
import type { CommitSearchHit } from '../../../../shared/types'
import { parseSearch, type CommitSearch, type CommitSearchMode, type GraphFilter } from '../../../../shared/historySearch'

interface GraphSearch {
  query: string
  changeQuery: (next: string) => void
  /** The mode picked in the dropdown; a typed prefix can override it (see `search`). */
  mode: CommitSearchMode
  changeMode: (next: CommitSearchMode) => void
  /** What's being searched for: the query with any prefix taken off. */
  search: CommitSearch
  /** The matches, or null with no search running. */
  hits: CommitSearchHit[] | null
  /** Why the last search failed, such as a regex git can't read. */
  error: string | null
  /** A search is running and its answer isn't in yet. */
  searching: boolean
  hitIndex: number
  hitSet: Set<string> | null
  /** Moves to the next (1) or previous (-1) match, wrapping round. */
  stepHit: (delta: number) => void
}

interface Found {
  key: string
  hits: CommitSearchHit[]
  error: string | null
}

// Searching changes reads every commit's diff, so wait a little longer for typing to stop.
const DEBOUNCE_MS: Record<CommitSearchMode, number> = {
  all: 200,
  message: 200,
  author: 200,
  path: 200,
  change: 400,
  regex: 400
}

/**
 * The graph's search box: searches as the query, mode or graph filter
 * changes and jumps to the first match.
 */
export function useGraphSearch({
  repoPath,
  filter,
  searchRef,
  searchFocusToken,
  onJumpToCommit
}: {
  repoPath: string
  /** The graph's path filter: positions are counted within it. */
  filter: GraphFilter | null
  searchRef: RefObject<HTMLInputElement | null>
  /** Focuses the search box whenever it changes (from 0). */
  searchFocusToken: number
  onJumpToCommit: (hit: CommitSearchHit) => void
}): GraphSearch {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<CommitSearchMode>('all')
  const [found, setFound] = useState<Found | null>(null)
  // The search sent off and not answered yet.
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const search = useMemo(() => parseSearch(query, mode), [query, mode])
  const key = JSON.stringify([repoPath, search.mode, search.term, filter])
  const active = search.term !== ''
  // Keep the last answer up while the next search runs, so typing doesn't flash "No matches".
  const hits = active && found ? found.hits : null
  const error = active && found?.key === key ? found.error : null
  const searching = active && pendingKey === key && found?.key !== key
  const [hitIndex, setHitIndex] = useState(0)
  const hitSet = useMemo(() => (hits ? new Set(hits.map((h) => h.hash)) : null), [hits])

  useEffect(() => {
    if (searchFocusToken === 0) return
    searchRef.current?.focus()
    searchRef.current?.select()
  }, [searchFocusToken, searchRef])

  const jumpToFirstHit = useEffectEvent((hit: CommitSearchHit) => onJumpToCommit(hit))

  useEffect(() => {
    if (!search.term) return
    let cancelled = false
    const timer = setTimeout(() => {
      setPendingKey(key)
      window.api.searchCommits(repoPath, search, filter).then((res) => {
        if (cancelled) return
        const results = res.ok ? res.data : []
        setFound({ key, hits: results, error: res.ok ? null : res.error })
        setHitIndex(0)
        if (results.length > 0) jumpToFirstHit(results[0])
      })
    }, DEBOUNCE_MS[search.mode])
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [repoPath, search, filter, key])

  const changeQuery = (next: string): void => {
    setQuery(next)
    // Don't flash the last search's results when a new one starts from empty.
    if (!parseSearch(next, mode).term) setFound(null)
  }

  const changeMode = (next: CommitSearchMode): void => {
    setMode(next)
    setFound(null)
  }

  const stepHit = (delta: number): void => {
    if (!hits || hits.length === 0) return
    const next = (hitIndex + delta + hits.length) % hits.length
    setHitIndex(next)
    onJumpToCommit(hits[next])
  }

  return { query, changeQuery, mode, changeMode, search, hits, error, searching, hitIndex, hitSet, stepHit }
}
