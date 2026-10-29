import type { GraphColumnWidths } from '../../../shared/types'
import type { GraphRow } from './graphLayout'

/** Width of one lane of the graph: wide enough for an author's avatar on each commit, like GitKraken. */
export const LANE_WIDTH = 24

/** Width of the graph drawing for a number of lanes. */
export function graphWidth(lanes: number): number {
  return lanes * LANE_WIDTH + 8
}

export type GraphColumn = keyof GraphColumnWidths

export const DEFAULT_COLUMN_WIDTHS: GraphColumnWidths = { refs: 170, graph: 0, author: 130, date: 96 }

export const COLUMN_LIMITS: Record<GraphColumn, { min: number; max: number }> = {
  refs: { min: 60, max: 480 },
  graph: { min: 32, max: 480 },
  author: { min: 60, max: 320 },
  date: { min: 60, max: 240 }
}

// Fitting the lanes stops here, so a repo with dozens of branches open at
// once doesn't push the messages off screen. Dragging can go wider.
const MAX_FITTED_LANES = 10

/** The graph column's width when it fits the lanes of the loaded rows. */
export function fitGraphWidth(rows: GraphRow[]): number {
  let lanes = 1
  for (const row of rows) lanes = Math.max(lanes, row.before.length, row.after.length, row.lane + 1)
  return graphWidth(Math.min(lanes, MAX_FITTED_LANES))
}

export function clampColumnWidth(column: GraphColumn, width: number): number {
  const { min, max } = COLUMN_LIMITS[column]
  return Math.round(Math.min(max, Math.max(min, width)))
}
