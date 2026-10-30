import { useEffect, useState } from 'react'
import type { GraphRow } from '../../lib/graphLayout'
import { BURST_STAGGER_MS, MERGE_BURST_MS, newCommits } from '../../lib/mergeBurst'

export interface Burst {
  /** Changes with each new arrival so the animations restart. */
  id: number
  /** Each arriving commit's start delay in ms: oldest first, so a pulled branch grows upwards. */
  delays: Map<string, number>
}

/**
 * The commits to animate in: whatever just arrived in the graph, whether
 * committed, merged, pulled or fetched.
 */
export function useMergeBurst(rows: GraphRow[], enabled: boolean): Burst | null {
  // Compared with the last graph while rendering, so the animation starts in
  // the same frame the new commits first appear.
  const [prevRows, setPrevRows] = useState(rows)
  const [burst, setBurst] = useState<Burst | null>(null)
  if (rows !== prevRows) {
    setPrevRows(rows)
    const arrived = enabled ? newCommits(prevRows, rows) : []
    if (arrived.length > 0) {
      setBurst({ id: (burst?.id ?? 0) + 1, delays: new Map(arrived.map((hash, i) => [hash, i * BURST_STAGGER_MS])) })
    }
  }
  useEffect(() => {
    if (!burst) return
    // Ended by time rather than animationend, which never fires if a row is
    // scrolled out of the virtual list or motion is reduced.
    const timer = setTimeout(() => setBurst(null), MERGE_BURST_MS + (burst.delays.size - 1) * BURST_STAGGER_MS)
    return () => clearTimeout(timer)
  }, [burst])
  return burst
}
