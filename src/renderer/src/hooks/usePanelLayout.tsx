import { useEffect, useState } from 'react'
import type { GraphColumnWidths, SavedLayout } from '../../../shared/types'
import { clampColumnWidth, DEFAULT_COLUMN_WIDTHS, type GraphColumn } from '../lib/graphColumns'
import { DEFAULT_HEIGHT as DEFAULT_TERMINAL_HEIGHT } from '../components/TerminalPanel'
import { DEFAULT_CLAUDE_WIDTH } from '../components/claude/ClaudePanel'

/**
 * The terminal and Claude panels and the commit graph's column widths, saved
 * between launches. Changes are saved only once `restore` has put back the
 * previous session's layout, so the defaults never overwrite it. Ctrl+`
 * toggles the terminal and Ctrl/Cmd+Esc the Claude panel.
 */
export function usePanelLayout() {
  const [restored, setRestored] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const [showClaude, setShowClaude] = useState(false)
  const [claudeWidth, setClaudeWidth] = useState(DEFAULT_CLAUDE_WIDTH)
  const [graphColumns, setGraphColumns] = useState<GraphColumnWidths>(DEFAULT_COLUMN_WIDTHS)

  useEffect(() => {
    if (!restored) return
    const timer = setTimeout(() => {
      window.api.saveLayout({ showTerminal, terminalHeight, showClaude, claudeWidth, graphColumns })
    }, 300)
    return () => clearTimeout(timer)
  }, [restored, showTerminal, terminalHeight, showClaude, claudeWidth, graphColumns])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'Backquote' && e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        setShowTerminal((v) => !v)
      } else if (e.key === 'Escape' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        setShowClaude((v) => !v)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  /** Sets one graph column's width, within its limits; a graph width of 0 fits the lanes. */
  const setGraphColumnWidth = (column: GraphColumn, width: number): void => {
    const next = column === 'graph' && width === 0 ? 0 : clampColumnWidth(column, width)
    setGraphColumns((current) => (current[column] === next ? current : { ...current, [column]: next }))
  }

  /** Puts back the layout saved at last quit. */
  const restore = (layout: Partial<SavedLayout>): void => {
    if (layout.showTerminal !== undefined) setShowTerminal(layout.showTerminal)
    if (layout.terminalHeight) setTerminalHeight(layout.terminalHeight)
    if (layout.showClaude !== undefined) setShowClaude(layout.showClaude)
    if (layout.claudeWidth) setClaudeWidth(layout.claudeWidth)
    setGraphColumns({
      ...DEFAULT_COLUMN_WIDTHS,
      ...(layout.refColumnWidth ? { refs: layout.refColumnWidth } : {}),
      ...layout.graphColumns
    })
    setRestored(true)
  }

  return {
    showTerminal,
    setShowTerminal,
    terminalHeight,
    setTerminalHeight,
    showClaude,
    setShowClaude,
    claudeWidth,
    setClaudeWidth,
    graphColumns,
    setGraphColumnWidth,
    restore
  }
}

export type PanelLayout = ReturnType<typeof usePanelLayout>
