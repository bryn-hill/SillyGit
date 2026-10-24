import type { GraphCommit } from '../../../shared/types'

export const LANE_COLORS = [
  '#bd93f9',
  '#50fa7b',
  '#ffb86c',
  '#ff79c6',
  '#ff5555',
  '#8be9fd',
  '#f1fa8c',
  '#6272a4'
]

export interface GraphRow {
  commit: GraphCommit
  lane: number
  color: string
  before: (string | null)[]
  beforeColors: string[]
  after: (string | null)[]
  afterColors: string[]
  incomingLanes: number[]
  mergeParentLanes: number[]
}

export function layoutGraph(commits: GraphCommit[]): GraphRow[] {
  const lanes: (string | null)[] = []
  const laneColor: string[] = []
  let colorIdx = 0
  const nextColor = (): string => LANE_COLORS[colorIdx++ % LANE_COLORS.length]

  const rows: GraphRow[] = []

  for (const commit of commits) {
    const before = lanes.slice()
    const beforeColors = laneColor.slice()

    let lane = lanes.indexOf(commit.hash)
    if (lane === -1) {
      lane = lanes.indexOf(null)
      if (lane === -1) {
        lane = lanes.length
        lanes.push(null)
        laneColor.push('')
      }
      laneColor[lane] = nextColor()
    }
    const color = laneColor[lane]

    const incomingLanes: number[] = []
    for (let i = 0; i < lanes.length; i++) {
      if (i !== lane && lanes[i] === commit.hash) {
        incomingLanes.push(i)
        lanes[i] = null
      }
    }

    const [firstParent, ...restParents] = commit.parents
    lanes[lane] = firstParent ?? null

    const mergeParentLanes: number[] = []
    for (const p of restParents) {
      let pLane = lanes.indexOf(p)
      if (pLane === -1 || pLane === lane) {
        pLane = lanes.indexOf(null)
        if (pLane === -1) {
          pLane = lanes.length
          lanes.push(null)
          laneColor.push('')
        }
        lanes[pLane] = p
        laneColor[pLane] = nextColor()
      }
      mergeParentLanes.push(pLane)
    }

    const after = lanes.slice()
    const afterColors = laneColor.slice()

    rows.push({ commit, lane, color, before, beforeColors, after, afterColors, incomingLanes, mergeParentLanes })
  }

  return rows
}
