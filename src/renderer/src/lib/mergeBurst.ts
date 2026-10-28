import type { GraphRow } from './graphLayout'

/** How long the merge animation runs, in ms; the CSS keyframes fit inside it. */
export const MERGE_BURST_MS = 1200

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

export interface Spark {
  dx: number
  dy: number
  color: string
  delay: number
}

/** Sparks flying out of the merge node, in fixed directions so every burst looks alike. */
export function sparks(colors: string[], count = 22): Spark[] {
  const out: Spark[] = []
  for (let i = 0; i < count; i++) {
    // Out to the sides and down: a new merge is usually the top row, where
    // anything flying upwards would be cut off.
    const angle = -0.2 * Math.PI + (i / (count - 1)) * 1.4 * Math.PI + (i % 2 ? 0.1 : -0.1)
    const distance = 18 + ((i * 7) % 5) * 5
    out.push({
      dx: Math.round(Math.cos(angle) * distance),
      dy: Math.round(Math.sin(angle) * distance),
      color: i % 4 === 3 ? '#ffffff' : colors[i % colors.length],
      delay: (i % 3) * 30
    })
  }
  return out
}
