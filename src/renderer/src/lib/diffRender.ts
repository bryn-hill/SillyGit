import { parseCommitDiff, type DiffUnit } from '../../../shared/diffSplit'
import { changedWordsForHunk, type WordRange } from '../../../shared/wordDiff'

export interface RenderedDiffLine {
  type: 'add' | 'remove' | 'context'
  text: string
  oldLine: number | null
  newLine: number | null
  /** The words that changed against the line this one replaced (or was replaced by), if paired. */
  words?: WordRange[] | null
}

export interface RenderedHunk {
  id: string
  header: string
  lines: RenderedDiffLine[]
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

function renderHunk(unit: DiffUnit): RenderedHunk {
  const headerLine = unit.hunkHeader ?? ''
  const match = headerLine.match(HUNK_HEADER_RE)
  let oldLine = match ? Number(match[1]) : 0
  let newLine = match ? Number(match[2]) : 0

  // `body` always ends with an extra '' entry from the diff text's trailing newline when
  // this is the last hunk of the last file — strip it so it doesn't render as a phantom line.
  const rawLines = unit.body.split('\n')
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop()

  const lines: RenderedDiffLine[] = []
  for (const raw of rawLines) {
    if (raw.startsWith('\\')) continue // "\ No newline at end of file"
    if (raw.startsWith('+')) {
      lines.push({ type: 'add', text: raw.slice(1), oldLine: null, newLine })
      newLine++
    } else if (raw.startsWith('-')) {
      lines.push({ type: 'remove', text: raw.slice(1), oldLine, newLine: null })
      oldLine++
    } else {
      lines.push({ type: 'context', text: raw.startsWith(' ') ? raw.slice(1) : raw, oldLine, newLine })
      oldLine++
      newLine++
    }
  }
  changedWordsForHunk(lines).forEach((words, i) => {
    if (words) lines[i].words = words
  })
  return { id: unit.id, header: headerLine, lines }
}

/** Renders a single file's unified diff text into hunks with both old- and new-side line numbers. */
export function renderFileDiff(diffText: string): RenderedHunk[] {
  const { units } = parseCommitDiff(diffText)
  return units.filter((u) => u.hunkHeader !== null).map(renderHunk)
}

export interface SplitRow {
  left: RenderedDiffLine | null
  right: RenderedDiffLine | null
}

/**
 * Pairs up a hunk's lines into left (old)/right (new) rows for side-by-side rendering.
 * Context lines appear on both sides of the same row; consecutive removed/added runs are
 * paired off index-by-index (padding the shorter run with blank rows) — a simple heuristic,
 * not a character-level alignment, but matches what most lightweight diff viewers do.
 */
export function pairForSplit(lines: RenderedDiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.type === 'context') {
      rows.push({ left: line, right: line })
      i++
      continue
    }
    const removes: RenderedDiffLine[] = []
    while (i < lines.length && lines[i].type === 'remove') {
      removes.push(lines[i])
      i++
    }
    const adds: RenderedDiffLine[] = []
    while (i < lines.length && lines[i].type === 'add') {
      adds.push(lines[i])
      i++
    }
    const max = Math.max(removes.length, adds.length)
    for (let k = 0; k < max; k++) {
      rows.push({ left: removes[k] ?? null, right: adds[k] ?? null })
    }
  }
  return rows
}
