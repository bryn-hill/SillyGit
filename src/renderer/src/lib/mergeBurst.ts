import type { GraphRow } from './graphLayout'

/** How long one commit's animation runs, in ms; the CSS keyframes fit inside it. */
export const MERGE_BURST_MS = 1100

/** Gap between commits animating in together, oldest first, in ms. */
export const BURST_STAGGER_MS = 90

/** At most this many commits animate in at once; a bigger pull animates its newest ones. */
export const MAX_BURST_COMMITS = 12

/**
 * The commits that have just arrived in the graph going from `previous` to
 * `next`, oldest first: made in the app or the terminal, merged, or brought in
 * by a pull or fetch. A commit counts when one of its parents was already in
 * the graph or arrived with it. That rules out opening a repo or switching
 * tabs, where the whole graph is new, and loading more history, which only
 * adds older commits whose parents aren't loaded yet.
 */
export function newCommits(previous: GraphRow[], next: GraphRow[]): string[] {
  if (previous.length === 0) return []
  const known = new Set(previous.map((r) => r.commit.hash))
  const arrived = new Set<string>()
  const order: string[] = []
  // Parents sit below their children, so walking up visits them first.
  for (let i = next.length - 1; i >= 0; i--) {
    const { hash, parents } = next[i].commit
    if (known.has(hash)) continue
    if (parents.some((p) => known.has(p) || arrived.has(p))) {
      arrived.add(hash)
      order.push(hash)
    }
  }
  return order.slice(-MAX_BURST_COMMITS)
}
