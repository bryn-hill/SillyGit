/**
 * Word-level highlighting for line diffs: pairs each removed line with the added line that
 * replaced it and finds which words changed between the two, so a viewer can mark them on
 * top of the whole-line colouring.
 */

/** A half-open `[start, end)` range of character offsets into a line's text. */
export type WordRange = [start: number, end: number]

export interface WordDiffLine {
  type: 'add' | 'remove' | 'context'
  text: string
}

/** Lines longer than this are left whole: they're usually minified or generated. */
const MAX_LINE_LENGTH = 1000
/** Upper bound on the token-comparison table, to keep a long pair from stalling a render. */
const MAX_TOKEN_CELLS = 120_000
/** Below this share of unchanged text the lines are a rewrite, and marking words is just noise. */
const MIN_SIMILARITY = 0.4

const TOKEN_RE = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu

/** Splits a line into words, runs of whitespace and single punctuation characters. */
export function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) ?? []
}

/** Marks which tokens on each side are outside a longest common subsequence of tokens. */
function changedTokens(a: string[], b: string[]): { a: boolean[]; b: boolean[] } {
  const n = a.length
  const m = b.length
  // lcs[i][j] = LCS length of a[i..] and b[j..], flattened.
  const width = m + 1
  const lcs = new Uint16Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }
  const changedA = new Array<boolean>(n).fill(true)
  const changedB = new Array<boolean>(m).fill(true)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      changedA[i++] = false
      changedB[j++] = false
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      i++
    } else {
      j++
    }
  }
  return { a: changedA, b: changedB }
}

/** Turns per-token change flags into character ranges, joining changes split only by whitespace. */
function toRanges(tokens: string[], changed: boolean[]): WordRange[] {
  const ranges: WordRange[] = []
  let offset = 0
  let gapIsSpace = false
  tokens.forEach((token, k) => {
    const end = offset + token.length
    if (changed[k]) {
      const last = ranges[ranges.length - 1]
      if (last && (last[1] === offset || gapIsSpace)) last[1] = end
      else ranges.push([offset, end])
      gapIsSpace = false
    } else {
      const last = ranges[ranges.length - 1]
      gapIsSpace = last != null && (last[1] === offset || gapIsSpace) && /^\s+$/.test(token)
    }
    offset = end
  })
  // A range's edge spaces are usually an arbitrary pick between equal spaces; keep them only
  // when the change is nothing but whitespace.
  const text = tokens.join('')
  return ranges.map(([start, end]) => {
    const slice = text.slice(start, end)
    const trimmed = slice.trim()
    if (trimmed === '') return [start, end]
    const lead = slice.length - slice.trimStart().length
    return [start + lead, start + lead + trimmed.length]
  })
}

function nonSpaceLength(tokens: string[], changed: boolean[], wantChanged: boolean): number {
  let total = 0
  tokens.forEach((token, k) => {
    if (changed[k] === wantChanged && !/^\s+$/.test(token)) total += token.length
  })
  return total
}

/**
 * The changed ranges in an old line and the new line that replaced it, or null when the
 * two are too different (or too long) for word highlights to help.
 */
export function diffWords(oldText: string, newText: string): { old: WordRange[]; new: WordRange[] } | null {
  if (oldText.length > MAX_LINE_LENGTH || newText.length > MAX_LINE_LENGTH) return null
  const a = tokenize(oldText)
  const b = tokenize(newText)
  if ((a.length + 1) * (b.length + 1) > MAX_TOKEN_CELLS) return null
  const changed = changedTokens(a, b)
  const kept = nonSpaceLength(a, changed.a, false)
  const longest = Math.max(kept + nonSpaceLength(a, changed.a, true), kept + nonSpaceLength(b, changed.b, true))
  if (longest > 0 && kept / longest < MIN_SIMILARITY) return null
  return { old: toRanges(a, changed.a), new: toRanges(b, changed.b) }
}

/**
 * Word highlights for a hunk's lines, index-aligned with `lines`. Each run of removed lines
 * is paired in order with the run of added lines that follows it; a line gets ranges only
 * when it has a partner similar enough to compare, otherwise null.
 */
export function changedWordsForHunk(lines: readonly WordDiffLine[]): (WordRange[] | null)[] {
  const result: (WordRange[] | null)[] = lines.map(() => null)
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'remove') {
      i++
      continue
    }
    const removeStart = i
    while (i < lines.length && lines[i].type === 'remove') i++
    const addStart = i
    while (i < lines.length && lines[i].type === 'add') i++
    const pairs = Math.min(addStart - removeStart, i - addStart)
    for (let k = 0; k < pairs; k++) {
      const words = diffWords(lines[removeStart + k].text, lines[addStart + k].text)
      if (!words) continue
      result[removeStart + k] = words.old
      result[addStart + k] = words.new
    }
  }
  return result
}

/** Splits `text` into consecutive pieces, flagging the ones inside `ranges` (sorted, non-overlapping). */
export function splitByRanges(text: string, ranges: readonly WordRange[]): { text: string; changed: boolean }[] {
  const pieces: { text: string; changed: boolean }[] = []
  let offset = 0
  for (const [rawStart, rawEnd] of ranges) {
    const start = Math.max(offset, Math.min(rawStart, text.length))
    const end = Math.min(rawEnd, text.length)
    if (end <= start) continue
    if (start > offset) pieces.push({ text: text.slice(offset, start), changed: false })
    pieces.push({ text: text.slice(start, end), changed: true })
    offset = end
  }
  if (offset < text.length || pieces.length === 0) pieces.push({ text: text.slice(offset), changed: false })
  return pieces
}
