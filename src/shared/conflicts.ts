// Parsing and rebuilding of conflicted files for the merge conflict resolver.
// Pure functions, shared by the main process (which produces the marked text
// with `git merge-file --diff3`) and the renderer (which rebuilds the output
// from the hunks and lines the user picked).

/** Lines keep their own line terminator, so joining them reproduces the file exactly. */
export type ConflictSegment =
  | { kind: 'common'; lines: string[] }
  | { kind: 'conflict'; id: number; ours: string[]; base: string[]; theirs: string[] }

export type ConflictHunk = Extract<ConflictSegment, { kind: 'conflict' }>

export type ConflictSide = 'ours' | 'theirs'

export interface PickedLine {
  side: ConflictSide
  index: number
}

/**
 * The lines taken into the output for each conflict hunk, keyed by hunk id,
 * in the order they were picked. A hunk with no entry (or an empty list) is
 * unresolved.
 */
export type ConflictPicks = Record<number, PickedLine[]>

/** One line of the output, with where it came from so the UI can colour it and offer removal. */
export interface OutputLine {
  text: string
  origin: 'common' | 'base' | 'marker' | ConflictSide
  hunkId?: number
  index?: number
}

/** Splits text into lines, each keeping its terminator ('\n' or '\r\n'). */
export function splitLines(text: string): string[] {
  if (text.length === 0) return []
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

function isMarker(line: string, char: string, size: number): boolean {
  if (line.length < size) return false
  for (let i = 0; i < size; i++) if (line[i] !== char) return false
  const next = line[size]
  // The marker is followed by a space and a label, or ends the line.
  return next === undefined || next === ' ' || next === '\n' || next === '\r'
}

/**
 * Parses diff3-style conflict markers (as written by `git merge-file --diff3`)
 * into common runs and conflict hunks. A file without markers comes back as one
 * common segment. Unterminated markers are treated as ordinary text.
 */
export function parseConflictMarkers(text: string, markerSize = 7): ConflictSegment[] {
  const lines = splitLines(text)
  const segments: ConflictSegment[] = []
  let common: string[] = []
  let nextId = 0
  let i = 0

  const flushCommon = (): void => {
    if (common.length > 0) segments.push({ kind: 'common', lines: common })
    common = []
  }

  while (i < lines.length) {
    const line = lines[i]
    if (!isMarker(line, '<', markerSize)) {
      common.push(line)
      i++
      continue
    }
    const ours: string[] = []
    const base: string[] = []
    const theirs: string[] = []
    let section: string[] = ours
    let j = i + 1
    let closed = false
    for (; j < lines.length; j++) {
      const l = lines[j]
      if (section === ours && isMarker(l, '|', markerSize)) section = base
      else if (section !== theirs && isMarker(l, '=', markerSize)) section = theirs
      else if (section === theirs && isMarker(l, '>', markerSize)) {
        closed = true
        break
      } else section.push(l)
    }
    if (!closed) {
      common.push(line)
      i++
      continue
    }
    flushCommon()
    segments.push({ kind: 'conflict', id: nextId++, ours, base, theirs })
    i = j + 1
  }
  flushCommon()
  return segments
}

export function conflictHunks(segments: ConflictSegment[]): ConflictHunk[] {
  return segments.filter((s): s is ConflictHunk => s.kind === 'conflict')
}

export function isLinePicked(picks: ConflictPicks, id: number, side: ConflictSide, index: number): boolean {
  return (picks[id] ?? []).some((p) => p.side === side && p.index === index)
}

/** Takes one line (appending it to the hunk's output), or drops it if it was taken. */
export function toggleLine(picks: ConflictPicks, id: number, side: ConflictSide, index: number): ConflictPicks {
  const current = picks[id] ?? []
  const next = isLinePicked(picks, id, side, index)
    ? current.filter((p) => !(p.side === side && p.index === index))
    : [...current, { side, index }]
  return { ...picks, [id]: next }
}

/** True when every line of one side of a hunk is taken (and the side has lines). */
export function isHunkSideTaken(hunk: ConflictHunk, picks: ConflictPicks, side: ConflictSide): boolean {
  const lines = hunk[side]
  return lines.length > 0 && lines.every((_, i) => isLinePicked(picks, hunk.id, side, i))
}

function withHunkSide(hunk: ConflictHunk, picks: ConflictPicks, side: ConflictSide, take: boolean): PickedLine[] {
  const others = (picks[hunk.id] ?? []).filter((p) => p.side !== side)
  return take ? [...others, ...hunk[side].map((_, index) => ({ side, index }))] : others
}

/**
 * Takes a whole side of one hunk, after whatever was already taken from the
 * other side; or, if that side is already fully taken, drops it.
 */
export function toggleHunkSide(hunk: ConflictHunk, picks: ConflictPicks, side: ConflictSide): ConflictPicks {
  return { ...picks, [hunk.id]: withHunkSide(hunk, picks, side, !isHunkSideTaken(hunk, picks, side)) }
}

/** True when every conflict line of a side, across all hunks, is taken. */
export function isSideTaken(segments: ConflictSegment[], picks: ConflictPicks, side: ConflictSide): boolean {
  const hunks = conflictHunks(segments).filter((h) => h[side].length > 0)
  return hunks.length > 0 && hunks.every((h) => isHunkSideTaken(h, picks, side))
}

/** Take all / untake all of one side across every hunk. */
export function setSideTaken(
  segments: ConflictSegment[],
  picks: ConflictPicks,
  side: ConflictSide,
  take: boolean
): ConflictPicks {
  const next: ConflictPicks = { ...picks }
  for (const h of conflictHunks(segments)) next[h.id] = withHunkSide(h, picks, side, take)
  return next
}

export function isHunkResolved(picks: ConflictPicks, id: number): boolean {
  return (picks[id] ?? []).length > 0
}

export function unresolvedCount(segments: ConflictSegment[], picks: ConflictPicks): number {
  return conflictHunks(segments).filter((h) => !isHunkResolved(picks, h.id)).length
}

export interface OutputOptions {
  /**
   * How an unresolved hunk is written: 'base' keeps the ancestor text (the
   * default, and what the output pane shows); 'markers' writes standard
   * conflict markers so it can be resolved later.
   */
  unresolved?: 'base' | 'markers'
  currentLabel?: string
  incomingLabel?: string
}

/**
 * Builds the output line by line: the common runs, the picked lines of each
 * hunk in the order they were picked, and unresolved hunks as `options` says.
 */
export function buildOutputLines(
  segments: ConflictSegment[],
  picks: ConflictPicks,
  options: OutputOptions = {}
): OutputLine[] {
  const out: OutputLine[] = []
  for (const s of segments) {
    if (s.kind === 'common') {
      for (const text of s.lines) out.push({ text, origin: 'common' })
      continue
    }
    const picked = picks[s.id] ?? []
    if (picked.length > 0) {
      for (const p of picked) out.push({ text: s[p.side][p.index], origin: p.side, hunkId: s.id, index: p.index })
    } else if (options.unresolved === 'markers') {
      const marker = (text: string): void => {
        out.push({ text, origin: 'marker', hunkId: s.id })
      }
      marker(`<<<<<<< ${options.currentLabel ?? 'current'}\n`)
      s.ours.forEach((text, index) => out.push({ text, origin: 'ours', hunkId: s.id, index }))
      marker('=======\n')
      s.theirs.forEach((text, index) => out.push({ text, origin: 'theirs', hunkId: s.id, index }))
      marker(`>>>>>>> ${options.incomingLabel ?? 'incoming'}\n`)
    } else {
      s.base.forEach((text) => out.push({ text, origin: 'base', hunkId: s.id }))
    }
  }
  // Every line but the very last needs a terminator, or it would run into the next one.
  const eol = out.some((l) => l.text.endsWith('\r\n')) ? '\r\n' : '\n'
  return out.map((l, i) =>
    i < out.length - 1 && !l.text.endsWith('\n') ? { ...l, text: l.text + eol } : l
  )
}

export function buildOutput(segments: ConflictSegment[], picks: ConflictPicks, options: OutputOptions = {}): string {
  return buildOutputLines(segments, picks, options)
    .map((l) => l.text)
    .join('')
}
