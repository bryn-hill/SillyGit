import { useEffect, useEffectEvent } from 'react'
import { isPrimary, isTyping } from '../lib/shortcuts'
import { tabForDigit } from '../lib/tabs'

/**
 * App-wide keyboard shortcuts: Cmd+K / Cmd+Shift+P for the palette, Cmd+F
 * search, Cmd+Z / Cmd+Shift+Z undo and redo, Cmd+O / Cmd+T open a repo,
 * Ctrl+Tab, Cmd+Shift+[ ] and Cmd+1…9 for tabs, Cmd+, for Settings and
 * Cmd+Shift+A to open the repo in the user's editor.
 * An effect event sees current state without re-registering the listener on
 * every render.
 */
export function useAppShortcuts(app: {
  /** A dialog that owns the keyboard is open (prompt, Settings, activity log). */
  blocked: boolean
  paletteOpen: boolean
  repoOpen: boolean
  busy: boolean
  tabs: string[]
  togglePalette: () => void
  focusSearch: () => void
  undo: () => void
  redo: () => void
  openRepo: () => void
  cycleTab: (offset: number) => void
  selectTab: (path: string) => void
  openSettings: () => void
  openInEditor: () => void
}): void {
  const onShortcut = useEffectEvent((e: KeyboardEvent): void => {
    if (app.blocked) return
    const key = e.key.toLowerCase()
    if ((isPrimary(e) && key === 'k') || (isPrimary(e, true) && key === 'p')) {
      e.preventDefault()
      app.togglePalette()
      return
    }
    if (app.paletteOpen) return
    if (isPrimary(e) && key === 'f' && app.repoOpen) {
      e.preventDefault()
      app.focusSearch()
    } else if (isPrimary(e) && key === 'z' && !isTyping(e.target) && app.repoOpen) {
      e.preventDefault()
      if (!app.busy) app.undo()
    } else if (isPrimary(e, true) && key === 'z' && !isTyping(e.target) && app.repoOpen) {
      e.preventDefault()
      if (!app.busy) app.redo()
    } else if (isPrimary(e) && (key === 'o' || key === 't')) {
      e.preventDefault()
      app.openRepo()
    } else if (e.key === 'Tab' && e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      app.cycleTab(e.shiftKey ? -1 : 1)
    } else if (isPrimary(e, true) && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault()
      app.cycleTab(e.code === 'BracketLeft' ? -1 : 1)
    } else if (isPrimary(e) && /^Digit[1-9]$/.test(e.code) && app.tabs.length > 0) {
      e.preventDefault()
      const target = tabForDigit(app.tabs, Number(e.code.slice(5)))
      if (target) app.selectTab(target)
    } else if (isPrimary(e) && key === ',') {
      e.preventDefault()
      app.openSettings()
    } else if (isPrimary(e, true) && key === 'a' && app.repoOpen && !isTyping(e.target)) {
      e.preventDefault()
      app.openInEditor()
    }
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => onShortcut(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
