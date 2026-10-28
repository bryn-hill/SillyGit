import { useEffect, useState } from 'react'
import type { GraphRow } from '../../lib/graphLayout'
import { MERGE_BURST_MS, newCommitAtHead } from '../../lib/mergeBurst'

/**
 * The commit to play the commit / merge animation on, if one just landed on
 * the checked-out branch. `id` changes with each new one so the animation restarts.
 */
export function useMergeBurst(
  rows: GraphRow[],
  headHash: string | null,
  enabled: boolean
): { hash: string; id: number } | null {
  // Compared with the last graph while rendering, so the burst starts in the
  // same frame the new commit first appears.
  const [prevRows, setPrevRows] = useState(rows)
  const [burst, setBurst] = useState<{ hash: string; id: number } | null>(null)
  if (rows !== prevRows) {
    setPrevRows(rows)
    const landed = enabled ? newCommitAtHead(prevRows, rows, headHash) : null
    if (landed) setBurst({ hash: landed, id: (burst?.id ?? 0) + 1 })
  }
  useEffect(() => {
    if (!burst) return
    // Ended by time rather than animationend, which never fires if the row is
    // scrolled out of the virtual list or motion is reduced.
    const timer = setTimeout(() => setBurst(null), MERGE_BURST_MS)
    return () => clearTimeout(timer)
  }, [burst])
  return burst
}
