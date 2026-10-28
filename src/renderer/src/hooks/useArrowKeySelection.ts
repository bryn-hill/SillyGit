import { useEffect } from 'react'
import { stepSelection, type Selection } from '../lib/selection'

/** ArrowUp/ArrowDown move the selection through the graph (WIP row first, then commits) while `enabled`. */
export function useArrowKeySelection(
  enabled: boolean,
  selection: Selection,
  order: string[],
  hasWorkingChanges: boolean,
  select: (selection: Selection) => void
): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const next = stepSelection(selection, order, hasWorkingChanges, e.key === 'ArrowDown' ? 1 : -1)
      if (!next) return
      e.preventDefault()
      select(next)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, selection, order, hasWorkingChanges, select])
}
