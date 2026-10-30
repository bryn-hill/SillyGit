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

/**
 * Key handler for a container of file rows: Up and Down move the open file to
 * the previous or next row, across every list inside the container, by
 * clicking it so it opens like a mouse selection would.
 */
export function onFileListKeyDown(e: KeyboardEvent<HTMLElement>): void {
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
