import type { BlameLine } from '../../../shared/types'

/** A run of neighbouring lines that came from the same commit, drawn as one block in the blame gutter. */
export interface BlameBlock {
  /** The first line's details. */
  line: BlameLine
  /** Line numbers, 1-based and inclusive. */
  start: number
  end: number
}

/** Groups blame lines (in line order) into blocks of neighbouring lines from the same commit. */
export function blameBlocks(lines: BlameLine[]): BlameBlock[] {
  const sorted = [...lines].sort((a, b) => a.lineNo - b.lineNo)
  const blocks: BlameBlock[] = []
  for (const line of sorted) {
    const last = blocks[blocks.length - 1]
    if (last && last.line.hash === line.hash && last.end === line.lineNo - 1) last.end = line.lineNo
    else blocks.push({ line, start: line.lineNo, end: line.lineNo })
  }
  return blocks
}

/**
 * How new each line is compared with the rest of the file, from 0 (the oldest) to 1
 * (the newest), for GitKraken's heat strip. Uncommitted lines are the newest.
 */
export function blameHeatScale(lines: BlameLine[]): (line: BlameLine) => number {
  const times = lines.filter((l) => !l.uncommitted).map((l) => new Date(l.date).getTime())
  const min = Math.min(...times)
  const max = Math.max(...times)
  return (line) => {
    if (line.uncommitted || !(max > min)) return 1
    return (new Date(line.date).getTime() - min) / (max - min)
  }
}
