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

/** An arriving commit's line is traced at most this many rows down towards its parent. */
export const MAX_TRACE_ROWS = 16

/**
 * One piece of a line in the graph, `row` rows below the arriving commit,
 * named after the element GraphCell draws for it.
 */
export type BurstSegment =
  /** From the commit's node down its own lane to the bottom of its row. */
  | { kind: 'own-bottom'; row: 0; lane: number }
  /** From a merge's node curving out and down into a parent's lane. */
  | { kind: 'out'; row: 0; from: number; to: number }
  /** Straight down a lane through a row whose commit is someone else's. */
  | { kind: 'pass'; row: number; lane: number }
  /** Down into the parent's node, in the parent's own lane. */
  | { kind: 'own-top'; row: number; lane: number }
  /** Curving in from another lane into the parent's node. */
  | { kind: 'in'; row: number; from: number; to: number }

/** A line from an arriving commit down to one of its parents, top first. */
export interface BurstEdge {
  color: string
  segments: BurstSegment[]
}

/**
 * The lines joining the commit at `index` to its parents, following the same
 * lanes, passes and curves the graph draws, so the animation can grow along
 * exactly the shape it settles into. A merge parent whose lane was already
 * running past the commit only gets the curve out to it: the lane below was
 * there before.
 */
export function traceEdges(rows: GraphRow[], index: number): BurstEdge[] {
  const row = rows[index]
  const edges: BurstEdge[] = []
  const follow = (lane: number, hash: string, first: BurstSegment, color: string): void => {
    const segments: BurstSegment[] = [first]
    for (let j = index + 1; j < rows.length && j - index <= MAX_TRACE_ROWS; j++) {
      const r = rows[j]
      if (r.commit.hash === hash) {
        segments.push(
          r.lane === lane ? { kind: 'own-top', row: j - index, lane } : { kind: 'in', row: j - index, from: lane, to: r.lane }
        )
        break
      }
      if (r.before[lane] !== hash) break
      segments.push({ kind: 'pass', row: j - index, lane })
    }
    edges.push({ color, segments })
  }
  const [firstParent, ...otherParents] = row.commit.parents
  if (firstParent !== undefined && row.after[row.lane] === firstParent) {
    follow(row.lane, firstParent, { kind: 'own-bottom', row: 0, lane: row.lane }, row.color)
  }
  row.mergeParentLanes.forEach((k, i) => {
    const parent = otherParents[i]
    const out: BurstSegment = { kind: 'out', row: 0, from: row.lane, to: k }
    if (row.before[k] === parent) edges.push({ color: row.afterColors[k], segments: [out] })
    else follow(k, parent, out, row.afterColors[k])
  })
  return edges
}

/** The key GraphCell gives the element it draws for a segment. */
export function segmentKey(segment: BurstSegment): string {
  switch (segment.kind) {
    case 'own-bottom':
      return 'own-bottom'
    case 'own-top':
      return 'own-top'
    case 'out':
      return `out-${segment.to}`
    case 'pass':
      return `p-${segment.lane}`
    case 'in':
      return `in-${segment.from}`
  }
}

/** Where every arriving commit's lines run, and which of the graph's own pieces to hold back until they've grown. */
export interface BurstPlan {
  edges: Map<string, BurstEdge[]>
  /** Row hash to the keys of its pieces an arriving line covers, with that line's start delay. */
  held: Map<string, Map<string, number>>
}

export function planBurst(rows: GraphRow[], delays: Map<string, number>): BurstPlan {
  const edges = new Map<string, BurstEdge[]>()
  const held = new Map<string, Map<string, number>>()
  if (delays.size === 0) return { edges, held }
  const indexOf = new Map(rows.map((r, i) => [r.commit.hash, i]))
  for (const [hash, delay] of delays) {
    const index = indexOf.get(hash)
    if (index === undefined) continue
    const traced = traceEdges(rows, index)
    edges.set(hash, traced)
    for (const edge of traced) {
      for (const segment of edge.segments) {
        if (segment.row === 0) continue
        const below = rows[index + segment.row].commit.hash
        const keys = held.get(below) ?? new Map<string, number>()
        const key = segmentKey(segment)
        keys.set(key, Math.max(keys.get(key) ?? 0, delay))
        held.set(below, keys)
      }
    }
  }
  return { edges, held }
}
