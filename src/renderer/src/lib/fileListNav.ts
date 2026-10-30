import type { KeyboardEvent } from 'react'

const ROW = '.file-row:not(.conflict-row)'

/**
 * Index of the row an arrow key moves to from `current` (-1 when none is
 * active), or null when it stays put. Moving down with nothing active picks the
 * first row and moving up picks the last.
 */
export function stepRow(current: number, count: number, key: 'ArrowUp' | 'ArrowDown'): number | null {
  if (count === 0) return null
  const next = current < 0 ? (key === 'ArrowDown' ? 0 : count - 1) : current + (key === 'ArrowDown' ? 1 : -1)
  return next < 0 || next >= count || next === current ? null : next
}

/** Keys that page through a document, and how far each moves a scroller of the given height (null: to an end). */
const PAGE_KEYS: Record<string, (height: number, shift: boolean) => number | null> = {
  PageDown: (h) => h * 0.9,
  PageUp: (h) => -h * 0.9,
  ' ': (h, shift) => (shift ? -h : h) * 0.9,
  Home: () => null,
  End: () => null
}

/** The diff (or blame) shown beside the file list, if one is open. */
function openDiffScroller(): HTMLElement | null {
  const bodies = Array.from(document.querySelectorAll<HTMLElement>('.diff-body'))
  return bodies.find((b) => b.checkVisibility()) ?? null
}

/**
 * While a file row has focus, the paging keys scroll the open diff rather than
 * the file list, so a picked file can be read from the keyboard while Up and
 * Down keep moving between files. Returns whether it handled the key.
 */
function pageOpenDiff(e: KeyboardEvent<HTMLElement>): boolean {
  const page = PAGE_KEYS[e.key]
  if (!page || e.altKey || e.ctrlKey || e.metaKey) return false
  if (!(e.target as HTMLElement).classList.contains('file-row')) return false
  const diff = openDiffScroller()
  if (!diff) return false
  e.preventDefault()
  const by = page(diff.clientHeight, e.shiftKey)
  if (by === null) diff.scrollTo({ top: e.key === 'Home' ? 0 : diff.scrollHeight })
  else diff.scrollBy({ top: by })
  return true
}

/**
 * Key handler for a container of file rows: Up and Down move the open file to
 * the previous or next row, across every list inside the container, by
 * clicking it so it opens like a mouse selection would. Page Up/Down, Space,
 * Home and End scroll the open diff.
 */
export function onFileListKeyDown(e: KeyboardEvent<HTMLElement>): void {
  if (pageOpenDiff(e)) return
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const target = e.target as HTMLElement
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ROW))
  const next = stepRow(
    rows.findIndex((r) => r.classList.contains('active')),
    rows.length,
    e.key
  )
  e.preventDefault()
  if (next === null) return
  rows[next].focus()
  rows[next].scrollIntoView({ block: 'nearest' })
  rows[next].click()
}
