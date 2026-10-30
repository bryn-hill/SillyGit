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

type FileRowKey = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

/**
 * What a plain key does to the focused row of the Unstaged or Staged list: S
 * stages, U unstages, and D, Delete or Backspace (the Mac's Delete key)
 * discards an unstaged file. Null for any other key or a modifier.
 */
export function fileRowKeyAction(e: FileRowKey, staged: boolean): 'stage' | 'unstage' | 'discard' | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  const key = e.key.toLowerCase()
  if (staged) return key === 'u' ? 'unstage' : null
  if (key === 's') return 'stage'
  if (key === 'd' || key === 'delete' || key === 'backspace') return 'discard'
  return null
}

/**
 * Opens and focuses the row after `row` in its list (or the one before when
 * it's the last), so staging one file after another can carry on from the
 * keyboard once the row moves to the other list.
 */
export function openNeighbourRow(row: HTMLElement): void {
  const rows = Array.from(row.closest('.file-list')?.querySelectorAll<HTMLElement>(ROW) ?? [])
  const at = rows.indexOf(row)
  const next = rows[at + 1] ?? rows[at - 1]
  if (!next || next === row) return
  next.focus()
  next.scrollIntoView({ block: 'nearest' })
  next.click()
}
