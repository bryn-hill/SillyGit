import type { LaneLineOwner, LanesStatus } from '../../../shared/lanes'

/** How many lane colours the themes define (`--lane-0` … in styles/base.css); lanes past that reuse them. */
const LANE_COLORS = 8

export function laneColor(index: number): string {
  return `var(--lane-${index % LANE_COLORS})`
}

/** What a working file's diff needs to show and change which lane owns each line. */
export interface DiffLanes {
  /** The applied lanes, to move lines to. */
  lanes: { name: string; color: number }[]
  /** The lane that owns a changed line (old-side number for a removal, new-side for an addition). */
  ownerOf: (kind: '+' | '-', line: number) => string | null
  /** Moves lines (or the whole file, for null) to a lane. */
  onMove: (lane: string, lines: { kind: '+' | '-'; line: number }[] | null) => void
}

/** The DiffLanes for one file of the working tree, or null when lanes are off. */
export function diffLanesFor(
  status: LanesStatus | null,
  path: string,
  move: (lane: string, change: { files?: { path: string }[]; lines?: { path: string; kind: '+' | '-'; line: number }[] }) => void
): DiffLanes | null {
  if (!status || status.drift) return null
  const owners = new Map<string, string>()
  for (const l of status.lines as LaneLineOwner[]) if (l.path === path) owners.set(`${l.kind}${l.line}`, l.lane)
  // A file that only moves as a whole (new, deleted, binary) has one owner for all of it.
  const wholeOwner = owners.size === 0 ? (status.files.find((f) => f.path === path)?.lane ?? null) : null
  return {
    lanes: status.lanes.filter((l) => l.applied).map((l) => ({ name: l.name, color: l.color })),
    ownerOf: (kind, line) => owners.get(`${kind}${line}`) ?? wholeOwner,
    onMove: (lane, lines) =>
      move(lane, lines && wholeOwner === null ? { lines: lines.map((l) => ({ path, ...l })) } : { files: [{ path }] })
  }
}
