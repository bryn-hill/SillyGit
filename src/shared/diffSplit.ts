interface Hunk {
  headerLine: string
  lines: string[]
}

interface FileBlock {
  headerLines: string[]
  hunks: Hunk[]
}

export interface DiffUnit {
  id: string
  file: string
  hunkHeader: string | null
  body: string
}

/** Splits a `git diff` body into per-file blocks, each with its header lines and hunks. */
function parseDiff(diffText: string): FileBlock[] {
  const lines = diffText.split('\n')
  const fileBlocks: FileBlock[] = []
  let current: FileBlock | null = null
  let currentHunk: Hunk | null = null

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) fileBlocks.push(current)
      current = { headerLines: [line], hunks: [] }
      currentHunk = null
      continue
    }
    if (!current) continue
    if (line.startsWith('@@')) {
      currentHunk = { headerLine: line, lines: [line] }
      current.hunks.push(currentHunk)
      continue
    }
    if (currentHunk) currentHunk.lines.push(line)
    else current.headerLines.push(line)
  }
  if (current) fileBlocks.push(current)
  return fileBlocks
}

function displayPath(block: FileBlock): string {
  const text = block.headerLines.join('\n')
  const newPath = text.match(/\n\+\+\+ b\/(.+)$/m)
  if (newPath && newPath[1] !== '/dev/null') return newPath[1]
  const oldPath = text.match(/\n--- a\/(.+)$/m)
  if (oldPath) return oldPath[1]
  const gitLine = block.headerLines[0].match(/^diff --git a\/(.+) b\/(.+)$/)
  if (gitLine) return gitLine[2]
  return '(unknown)'
}

/** A parsed commit diff, ready for grouping into a split. */
export interface ParsedCommitDiff {
  fileBlocks: FileBlock[]
  units: DiffUnit[]
}

export function parseCommitDiff(diffText: string): ParsedCommitDiff {
  const fileBlocks = parseDiff(diffText)
  const units: DiffUnit[] = []
  fileBlocks.forEach((block, fi) => {
    const file = displayPath(block)
    if (block.hunks.length === 0) {
      units.push({ id: `f${fi}`, file, hunkHeader: null, body: '' })
    } else {
      block.hunks.forEach((hunk, hi) => {
        units.push({
          id: `f${fi}h${hi}`,
          file,
          hunkHeader: hunk.headerLine,
          body: hunk.lines.slice(1).join('\n')
        })
      })
    }
  })
  return { fileBlocks, units }
}

/**
 * Rebuilds a valid patch containing exactly the given subset of units, each file's
 * header emitted once and its included hunks kept in their original order. Applying
 * this against the commit's parent (via `git apply --cached`) reproduces that subset
 * of the original change.
 */
export function buildPatchForUnits(fileBlocks: FileBlock[], includedIds: ReadonlySet<string>): string {
  const parts: string[] = []
  fileBlocks.forEach((block, fi) => {
    if (block.hunks.length === 0) {
      if (includedIds.has(`f${fi}`)) parts.push(block.headerLines.join('\n'))
      return
    }
    const includedHunks = block.hunks.filter((_, hi) => includedIds.has(`f${fi}h${hi}`))
    if (includedHunks.length === 0) return
    parts.push(block.headerLines.join('\n'))
    for (const hunk of includedHunks) parts.push(hunk.lines.join('\n'))
  })
  return parts.join('\n') + '\n'
}

export function allUnitIds(units: DiffUnit[]): Set<string> {
  return new Set(units.map((u) => u.id))
}

/** Throws if groups don't partition the full unit id set exactly (no gaps, no overlaps, no unknown ids). */
export function validateGroupCoverage(
  units: DiffUnit[],
  groups: { unitIds: string[] }[]
): void {
  const all = allUnitIds(units)
  const seen = new Set<string>()
  for (const group of groups) {
    for (const id of group.unitIds) {
      if (!all.has(id)) throw new Error(`Unknown unit id in AI response: ${id}`)
      if (seen.has(id)) throw new Error(`Unit id assigned to more than one group: ${id}`)
      seen.add(id)
    }
  }
  if (seen.size !== all.size) {
    const missing = [...all].filter((id) => !seen.has(id))
    throw new Error(`AI split response is missing units: ${missing.join(', ')}`)
  }
}
