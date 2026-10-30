import { useEffect } from 'react'

/**
 * Escape leaves whatever Tab focused, so the arrow keys drive the graph again.
 * Components that handle Escape themselves preventDefault, and the terminal
 * keeps it for the shell.
 */
export function useEscapeToLeaveFocus(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const active = document.activeElement as HTMLElement | null
      if (!active || active === document.body || active.closest('.xterm, .monaco-editor')) return
      active.blur()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
