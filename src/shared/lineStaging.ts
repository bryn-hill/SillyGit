import { parseCommitDiff } from './diffSplit'

// Staging part of a file: one hunk, or chosen lines of it, turned into a patch
// `git apply` takes. The patch is built the way `git add -p` edits a hunk: a
// line left out of the selection still has to describe the file the patch is
// applied to, so it either becomes context or disappears.

/** What to do with the chosen change. */
export type PartialAction = 'stage' | 'unstage' | 'discard'

/**
 * Which way the patch goes: staging moves the working copy's change into the
 * index (forwards), while unstaging (from the staged diff) and discarding
 * (from the unstaged diff) take it back out (applied with `-R`).
 */
export function isReverse(action: PartialAction): boolean {
  return action !== 'stage'
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

/**
 * A patch holding one hunk of `diffText` (by its `parseCommitDiff` unit id),
 * cut down to the lines at `selected` (indexes into the hunk's body lines,
 * "\ No newline" markers not counted), or the whole hunk when `selected` is
 * null. Returns null when the selection holds no added or removed line.
 *
 * For a forward patch an unselected removal stays as context (the target
 * still has it) and an unselected addition is dropped; a reverse patch is
 * matched against the new side, so the two swap.
 */
export function buildPartialPatch(
  diffText: string,
  unitId: string,
  selected: ReadonlySet<number> | null,
  reverse: boolean
): string | null {
  const { fileBlocks } = parseCommitDiff(diffText)
  const m = /^f(\d+)h(\d+)$/.exec(unitId)
  if (!m) return null
  const block = fileBlocks[Number(m[1])]
  const hunk = block?.hunks[Number(m[2])]
  if (!hunk) return null
  const header = HUNK_HEADER_RE.exec(hunk.headerLine)
  if (!header) return null

  const body = hunk.lines.slice(1)
  // A trailing '' is the diff text's final newline, not a line of the hunk.
  if (body.length > 0 && body[body.length - 1] === '') body.pop()

  const out: string[] = []
  let oldCount = 0
  let newCount = 0
  let changes = 0
  let index = -1
  let keptPrevious = false
  for (const line of body) {
    if (line.startsWith('\\')) {
      // "\ No newline at end of file" belongs to the line before it.
      if (keptPrevious) out.push(line)
      continue
    }
    index++
    const kind = line[0]
    const chosen = selected == null || selected.has(index)
    if (kind === '+' || kind === '-') {
      if (chosen) {
        out.push(line)
        changes++
        if (kind === '+') newCount++
        else oldCount++
        keptPrevious = true
      } else if ((kind === '-') !== reverse) {
        // Unselected, but present in the file the patch is applied to: keep it as context.
        out.push(' ' + line.slice(1))
        oldCount++
        newCount++
        keptPrevious = true
      } else {
        keptPrevious = false
      }
    } else {
      out.push(line.length === 0 ? ' ' : line)
      oldCount++
      newCount++
      keptPrevious = true
    }
  }
  if (changes === 0) return null

  // The start lines stay as they were: the side the patch is matched against
  // is unchanged by what was left out. Apply with --recount all the same.
  const hunkHeader = `@@ -${header[1]},${oldCount} +${header[2]},${newCount} @@${header[3]}`
  return [...block.headerLines, hunkHeader, ...out].join('\n') + '\n'
}

/** Index of each added or removed line in a hunk body, for selecting all of them or ranges. */
export function changedLineIndexes(lines: ReadonlyArray<{ type: 'add' | 'remove' | 'context' }>): number[] {
  const out: number[] = []
  lines.forEach((l, i) => {
    if (l.type !== 'context') out.push(i)
  })
  return out
}
