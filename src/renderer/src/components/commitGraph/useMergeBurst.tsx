import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GraphRow } from '../../lib/graphLayout'
import { BURST_STAGGER_MS, MERGE_BURST_MS, newCommits, planBurst, type BurstPlan } from '../../lib/mergeBurst'

export interface Burst extends BurstPlan {
  /** Changes with each new arrival so the animations restart. */
  id: number
  /** Each arriving commit's start delay in ms: oldest first, so a pulled branch grows upwards. */
  delays: Map<string, number>
}

/**
 * The commits to animate in: whatever just arrived in the graph, whether
 * committed, merged, pulled or fetched. `view` changes whenever the graph is
 * read afresh rather than updated (another tab, a path filter, a branch
 * scope), and then nothing animates: those commits were there all along.
 */
export function useMergeBurst(rows: GraphRow[], view: number, enabled: boolean): Burst | null {
  // Compared with the last graph while rendering, so the animation starts in
  // the same frame the new commits first appear.
  const [prev, setPrev] = useState({ rows, view })
  const [arrival, setArrival] = useState<{ id: number; delays: Map<string, number> } | null>(null)
  if (rows !== prev.rows || view !== prev.view) {
    setPrev({ rows, view })
    const arrived = enabled && view === prev.view ? newCommits(prev.rows, rows) : []
    if (arrived.length > 0) {
      setArrival({ id: (arrival?.id ?? 0) + 1, delays: new Map(arrived.map((hash, i) => [hash, i * BURST_STAGGER_MS])) })
    } else if (view !== prev.view && arrival) {
      setArrival(null)
    }
  }

  // When the animation started, so it isn't played again if the graph is
  // hidden and shown (another view covers it, say) partway through: hiding
  // stops the timer and showing restarts every CSS animation from scratch.
  const started = useRef<{ id: number; at: number } | null>(null)
  useLayoutEffect(() => {
    if (!arrival) return
    if (started.current?.id !== arrival.id) started.current = { id: arrival.id, at: performance.now() }
    // Ended by time rather than animationend, which never fires if a row is
    // scrolled out of the virtual list or motion is reduced.
    const length = MERGE_BURST_MS + (arrival.delays.size - 1) * BURST_STAGGER_MS
    const left = length - (performance.now() - started.current.at)
    // Shown again after it should have finished: drop it before the browser
    // paints the restarted animation.
    if (left <= 50) {
      setArrival(null)
      return
    }
    const timer = setTimeout(() => setArrival(null), left)
    return () => clearTimeout(timer)
  }, [arrival])

  const plan = useMemo(() => (arrival ? planBurst(rows, arrival.delays) : null), [arrival, rows])
  return arrival && plan ? { ...arrival, ...plan } : null
}
