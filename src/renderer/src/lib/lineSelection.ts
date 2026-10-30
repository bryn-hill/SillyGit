import type { RenderedDiffLine } from './diffRender'

/** Lines picked in one hunk; `anchor` is where a shift-click range starts. */
export interface PickedLines {
  hunkId: string
  lines: number[]
  anchor: number
}

/**
 * The selection after clicking the changed line at `index` of a hunk: a plain
 * click toggles that line, a shift-click adds every changed line between the
 * anchor and it. Clicking in another hunk starts over there.
 */
export function selectDiffLine(
  current: PickedLines | null,
  hunkId: string,
  hunkLines: RenderedDiffLine[],
  index: number,
  extend: boolean
): PickedLines | null {
  const same = current?.hunkId === hunkId ? current : null
  if (extend && same) {
    const [from, to] = same.anchor < index ? [same.anchor, index] : [index, same.anchor]
    const picked = new Set(same.lines)
    for (let i = from; i <= to; i++) if (hunkLines[i]?.type !== 'context') picked.add(i)
    return { hunkId, lines: [...picked].sort((a, b) => a - b), anchor: same.anchor }
  }
  const lines = same?.lines ?? []
  const next = lines.includes(index) ? lines.filter((i) => i !== index) : [...lines, index].sort((a, b) => a - b)
  return next.length === 0 ? null : { hunkId, lines: next, anchor: index }
}
