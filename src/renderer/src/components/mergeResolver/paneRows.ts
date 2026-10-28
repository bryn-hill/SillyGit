import type { ConflictHunk, ConflictSegment, ConflictSide } from '../../../../shared/conflicts'

export const SIDE_LETTER: Record<ConflictSide, string> = { ours: 'A', theirs: 'B' }

export function stripEol(line: string): string {
  return line.replace(/\r?\n$/, '')
}

/**
 * One row of the A or B pane. Both panes get the same rows (a conflict hunk is
 * padded to the longer side), so they line up and can scroll together.
 */
type PaneRow =
  | { kind: 'common'; text: string; lineNo: number }
  | { kind: 'hunk-header'; hunk: ConflictHunk; number: number }
  | { kind: 'conflict'; hunk: ConflictHunk; index: number; text: string; lineNo: number }
  | { kind: 'pad'; hunkId: number }

export function paneRows(segments: ConflictSegment[], side: ConflictSide): PaneRow[] {
  const rows: PaneRow[] = []
  let lineNo = 1
  let hunkNumber = 0
  for (const s of segments) {
    if (s.kind === 'common') {
      for (const text of s.lines) rows.push({ kind: 'common', text, lineNo: lineNo++ })
      continue
    }
    rows.push({ kind: 'hunk-header', hunk: s, number: ++hunkNumber })
    const lines = s[side]
    const height = Math.max(s.ours.length, s.theirs.length, 1)
    for (let i = 0; i < height; i++) {
      if (i < lines.length) rows.push({ kind: 'conflict', hunk: s, index: i, text: lines[i], lineNo: lineNo++ })
      else rows.push({ kind: 'pad', hunkId: s.id })
    }
  }
  return rows
}
