import type { JSX } from 'react'
import type { GraphRow } from '../lib/graphLayout'

const ROW_HEIGHT = 32
const LANE_W = 16

export function laneX(i: number): number {
  return i * LANE_W + LANE_W / 2 + 4
}

export function graphWidth(maxLanes: number): number {
  return maxLanes * LANE_W + 8
}

export default function GraphCell({ row }: { row: GraphRow }): JSX.Element {
  const maxLanes = Math.max(row.before.length, row.after.length, row.lane + 1)
  const width = graphWidth(maxLanes)
  const cy = ROW_HEIGHT / 2
  const elements: JSX.Element[] = []

  for (let k = 0; k < maxLanes; k++) {
    if (k === row.lane) continue
    const hasAbove = k < row.before.length && row.before[k] !== null
    const hasBelow = k < row.after.length && row.after[k] !== null
    if (hasAbove && hasBelow && !row.incomingLanes.includes(k)) {
      elements.push(
        <line
          key={`p-${k}`}
          x1={laneX(k)}
          y1={0}
          x2={laneX(k)}
          y2={ROW_HEIGHT}
          stroke={row.beforeColors[k]}
          strokeWidth={2}
        />
      )
    }
  }

  const hasAboveOwn = row.lane < row.before.length && row.before[row.lane] !== null
  if (hasAboveOwn) {
    elements.push(
      <line
        key="own-top"
        x1={laneX(row.lane)}
        y1={0}
        x2={laneX(row.lane)}
        y2={cy}
        stroke={row.color}
        strokeWidth={2}
      />
    )
  }

  const hasBelowOwn = row.lane < row.after.length && row.after[row.lane] !== null
  if (hasBelowOwn) {
    elements.push(
      <line
        key="own-bottom"
        x1={laneX(row.lane)}
        y1={cy}
        x2={laneX(row.lane)}
        y2={ROW_HEIGHT}
        stroke={row.color}
        strokeWidth={2}
      />
    )
  }

  for (const k of row.incomingLanes) {
    const x0 = laneX(k)
    const x1 = laneX(row.lane)
    elements.push(
      <path
        key={`in-${k}`}
        d={`M ${x0} 0 C ${x0} ${cy}, ${x1} ${cy}, ${x1} ${cy}`}
        stroke={row.beforeColors[k]}
        strokeWidth={2}
        fill="none"
      />
    )
  }

  for (const k of row.mergeParentLanes) {
    const x0 = laneX(row.lane)
    const x1 = laneX(k)
    elements.push(
      <path
        key={`out-${k}`}
        d={`M ${x0} ${cy} C ${x0} ${cy}, ${x1} ${cy}, ${x1} ${ROW_HEIGHT}`}
        stroke={row.afterColors[k]}
        strokeWidth={2}
        fill="none"
      />
    )
  }

  elements.push(
    <circle key="dot" cx={laneX(row.lane)} cy={cy} r={5} fill={row.color} stroke="#282a36" strokeWidth={2} />
  )

  return (
    <svg width={width} height={ROW_HEIGHT} className="graph-svg">
      {elements}
    </svg>
  )
}

export function WipGraphCell({ lane, color }: { lane: number; color: string }): JSX.Element {
  const width = graphWidth(lane + 1)
  const cy = ROW_HEIGHT / 2
  return (
    <svg width={width} height={ROW_HEIGHT} className="graph-svg">
      <line x1={laneX(lane)} y1={cy} x2={laneX(lane)} y2={ROW_HEIGHT} stroke={color} strokeWidth={2} />
      <circle
        cx={laneX(lane)}
        cy={cy}
        r={5}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="2,2"
      />
    </svg>
  )
}
