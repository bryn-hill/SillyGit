import type { CSSProperties, JSX } from 'react'
import type { GraphRow } from '../lib/graphLayout'
import Avatar from './Avatar'

export const ROW_HEIGHT = 32
// Wide enough for an author's avatar on each commit, like GitKraken.
const LANE_W = 24
const AVATAR_SIZE = 18

function laneX(i: number): number {
  return i * LANE_W + LANE_W / 2 + 4
}

function graphWidth(maxLanes: number): number {
  return maxLanes * LANE_W + 8
}

export default function GraphCell({
  row,
  repoPath,
  connector = false,
  wipLink,
  burst
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
  /**
   * Set on a commit that has just arrived: plays its animation after `delay`
   * ms, again whenever `id` changes.
   */
  burst?: { id: number; delay: number }
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
      <line
        key={`ref-${burst?.id ?? 'still'}`}
        // While a new commit arrives, the line from its pill finishes growing
        // here, meeting the node as it pops in.
        className={burst !== undefined ? 'ref-connector-burst-node' : undefined}
        pathLength={burst !== undefined ? 1 : undefined}
        x1={0}
        y1={cy}
        x2={laneX(row.lane)}
        y2={cy}
        stroke={row.color}
        strokeWidth={2}
      />
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

  // While the animation plays, its own lines draw the joins.
  const joinClass = burst !== undefined ? 'merge-burst-join' : undefined

  const hasAboveOwn = row.lane < row.before.length && row.before[row.lane] !== null
  if (hasAboveOwn) {
    elements.push(
      <line
        key="own-top"
        className={joinClass}
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
        className={joinClass}
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
        className={joinClass}
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
      <circle
        key="dot"
        className={burst !== undefined ? 'merge-burst-node' : undefined}
        cx={laneX(row.lane)}
        cy={cy}
        r={5}
        fill={row.color}
        stroke="var(--bg)"
        strokeWidth={2}
      />
    )
  }

  return (
    <div
      className="graph-cell"
      // Every part of the animation, in this cell and the overlay, waits this long.
      style={{ width, height: ROW_HEIGHT, ...(burst && ({ '--burst-delay': `${burst.delay}ms` } as CSSProperties)) }}
    >
      <svg width={width} height={ROW_HEIGHT} className="graph-svg">
        {elements}
      </svg>
      {burst !== undefined && <MergeBurst key={`burst-${burst.id}`} row={row} />}
      {!isMerge && (
        <Avatar
          // Keyed so the pop replays for each new animation.
          key={`avatar-${burst?.id ?? 'still'}`}
          className={`graph-node-avatar ${burst !== undefined ? 'commit-burst-avatar' : ''}`}
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

/**
 * The new commit / merge animation, in the style of Mini Metro: each parent's
 * line grows up into the new commit like a metro line being extended, a clean
 * station (a merge's dot, or a commit's avatar) pops in where it ends, and
 * everything settles into the normal graph. Drawn over the rows below, so it
 * can't take clicks.
 */
function MergeBurst({ row }: { row: GraphRow }): JSX.Element {
  const cy = ROW_HEIGHT / 2
  const x0 = laneX(row.lane)
  const isMerge = row.commit.parents.length > 1
  // How far below the commit the lines start growing from, in rows: a plain
  // commit's parent is usually the next row down.
  const startY = cy + ROW_HEIGHT * (isMerge ? 2.5 : 1)
  const lines: { key: string; d: string; color: string }[] = []
  if (row.lane < row.after.length && row.after[row.lane] !== null) {
    lines.push({ key: 'own', d: `M ${x0} ${startY} L ${x0} ${cy}`, color: row.color })
  }
  for (const k of row.mergeParentLanes) {
    const x1 = laneX(k)
    lines.push({
      key: `in-${k}`,
      d: `M ${x1} ${startY} L ${x1} ${ROW_HEIGHT} C ${x1} ${cy}, ${x0} ${cy}, ${x0} ${cy}`,
      color: row.afterColors[k]
    })
  }
  // Room for the station's pulse ring around the node.
  const pad = 24
  const width = graphWidth(Math.max(row.after.length, row.lane + 1)) + pad * 2
  const height = startY + pad
  return (
    <svg
      className="merge-burst"
      data-testid="merge-burst"
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`${-pad} ${-pad} ${width} ${height}`}
      style={{ left: -pad, top: -pad }}
    >
      {lines.map((l, i) => (
        <path
          key={l.key}
          className="merge-burst-line"
          d={l.d}
          pathLength={1}
          stroke={l.color}
          // The second parent's line follows a beat behind the first.
          style={{ '--line-delay': `${i * 70}ms` } as CSSProperties}
        />
      ))}
      <circle className="merge-burst-pulse" cx={x0} cy={cy} r={isMerge ? 7 : 10} stroke={row.color} />
      {isMerge && <circle className="merge-burst-station" cx={x0} cy={cy} r={6} stroke={row.color} />}
    </svg>
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
