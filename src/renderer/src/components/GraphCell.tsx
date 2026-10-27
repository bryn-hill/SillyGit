import type { JSX } from 'react'
import type { GraphRow } from '../lib/graphLayout'
import Avatar from './Avatar'

export const ROW_HEIGHT = 32
// Wide enough for an author's avatar on each commit, like GitKraken.
const LANE_W = 24
const AVATAR_SIZE = 18

export function laneX(i: number): number {
  return i * LANE_W + LANE_W / 2 + 4
}

export function graphWidth(maxLanes: number): number {
  return maxLanes * LANE_W + 8
}

export default function GraphCell({
  row,
  repoPath,
  connector = false,
  wipLink
}: {
  row: GraphRow
  repoPath: string
  /** Continues the line from the row's branch / tag pill over to the commit. */
  connector?: boolean
  /**
   * The dashed line from the WIP node down to the checked-out commit: 'pass'
   * crosses this row in the checked-out commit's lane, 'end' stops at this
   * row's node because it is the checked-out commit.
   */
  wipLink?: { kind: 'pass' | 'end'; lane: number; color: string }
}): JSX.Element {
  const maxLanes = Math.max(row.before.length, row.after.length, row.lane + 1, (wipLink?.lane ?? 0) + 1)
  const width = graphWidth(maxLanes)
  const cy = ROW_HEIGHT / 2
  const elements: JSX.Element[] = []

  if (wipLink) {
    elements.push(
      <line
        key="wip"
        data-testid="wip-link"
        x1={laneX(wipLink.lane)}
        y1={0}
        x2={laneX(wipLink.lane)}
        y2={wipLink.kind === 'end' ? cy : ROW_HEIGHT}
        stroke={wipLink.color}
        strokeWidth={2}
        strokeDasharray="3,3"
      />
    )
  }

  // Drawn first so the lanes it crosses stay on top.
  if (connector) {
    elements.push(
      <line key="ref" x1={0} y1={cy} x2={laneX(row.lane)} y2={cy} stroke={row.color} strokeWidth={2} />
    )
  }

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
        data-testid="merge-line"
        d={`M ${x0} ${cy} C ${x0} ${cy}, ${x1} ${cy}, ${x1} ${ROW_HEIGHT}`}
        stroke={row.afterColors[k]}
        strokeWidth={2}
        fill="none"
      />
    )
  }

  // Merge commits keep a small dot; every other commit shows its author.
  const isMerge = row.commit.parents.length > 1
  if (isMerge) {
    elements.push(
      <circle key="dot" cx={laneX(row.lane)} cy={cy} r={5} fill={row.color} stroke="#282a36" strokeWidth={2} />
    )
  }

  return (
    <div className="graph-cell" style={{ width, height: ROW_HEIGHT }}>
      <svg width={width} height={ROW_HEIGHT} className="graph-svg">
        {elements}
      </svg>
      {!isMerge && (
        <Avatar
          className="graph-node-avatar"
          name={row.commit.author}
          email={row.commit.authorEmail}
          hash={row.commit.hash}
          repoPath={repoPath}
          size={AVATAR_SIZE}
          ring={row.color}
          style={{ left: laneX(row.lane) - AVATAR_SIZE / 2, top: cy - AVATAR_SIZE / 2 }}
        />
      )}
    </div>
  )
}

export function WipGraphCell({ lane, color }: { lane: number; color: string }): JSX.Element {
  const width = graphWidth(lane + 1)
  const cy = ROW_HEIGHT / 2
  return (
    <svg width={width} height={ROW_HEIGHT} className="graph-svg">
      <line
        data-testid="wip-link"
        x1={laneX(lane)}
        y1={cy + 6}
        x2={laneX(lane)}
        y2={ROW_HEIGHT}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="3,3"
      />
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
