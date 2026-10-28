import type { GraphRow } from './graphLayout'

/** How long the merge animation runs, in ms; the CSS keyframes fit inside it. */
export const MERGE_BURST_MS = 1100

/**
 * The merge commit HEAD has just moved onto, if the graph went from `previous`
 * to `next` because of a merge (in the app, a pull, a drop or the terminal).
 * It must be new and its first parent, the branch it was merged into, must
 * already have been in the graph. That rules out opening a repo or switching
 * tabs, where the whole graph is new.
 */
export function newMergeAtHead(previous: GraphRow[], next: GraphRow[], headHash: string | null): string | null {
  if (!headHash || previous.length === 0) return null
  const head = next.find((r) => r.commit.hash === headHash)
  if (!head || head.commit.parents.length < 2) return null
  const known = new Set(previous.map((r) => r.commit.hash))
  if (known.has(headHash) || !known.has(head.commit.parents[0])) return null
  return headHash
}
