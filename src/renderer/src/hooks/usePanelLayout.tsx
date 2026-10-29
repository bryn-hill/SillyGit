import { useEffect, useState } from 'react'
import type { SavedLayout } from '../../../shared/types'
import { DEFAULT_REF_COLUMN_WIDTH } from '../components/CommitGraph'
import { DEFAULT_HEIGHT as DEFAULT_TERMINAL_HEIGHT } from '../components/TerminalPanel'
import { DEFAULT_CLAUDE_WIDTH } from '../components/claude/ClaudePanel'

/**
 * The terminal and Claude panels, the side bar and detail panel widths and the graph's Branch / Tag column, saved
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
  const [refColumnWidth, setRefColumnWidth] = useState(DEFAULT_REF_COLUMN_WIDTH)
  const [sidebarWidth, setSidebarWidth] = useState<number | undefined>()
  const [detailWidth, setDetailWidth] = useState<number | undefined>()

  useEffect(() => {
    if (!restored) return
    const timer = setTimeout(() => {
      window.api.saveLayout({ showTerminal, terminalHeight, showClaude, claudeWidth, refColumnWidth, sidebarWidth, detailWidth })
    }, 300)
    return () => clearTimeout(timer)
  }, [restored, showTerminal, terminalHeight, showClaude, claudeWidth, refColumnWidth, sidebarWidth, detailWidth])

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

  /** Puts back the layout saved at last quit. */
  const restore = (layout: Partial<SavedLayout>): void => {
    if (layout.showTerminal !== undefined) setShowTerminal(layout.showTerminal)
    if (layout.terminalHeight) setTerminalHeight(layout.terminalHeight)
    if (layout.showClaude !== undefined) setShowClaude(layout.showClaude)
    if (layout.claudeWidth) setClaudeWidth(layout.claudeWidth)
    if (layout.refColumnWidth) setRefColumnWidth(layout.refColumnWidth)
    if (layout.sidebarWidth) setSidebarWidth(layout.sidebarWidth)
    if (layout.detailWidth) setDetailWidth(layout.detailWidth)
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
    refColumnWidth,
    setRefColumnWidth,
    sidebarWidth,
    setSidebarWidth,
    detailWidth,
    setDetailWidth,
    restore
  }
}

export type PanelLayout = ReturnType<typeof usePanelLayout>
