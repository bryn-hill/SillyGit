export const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')

/** How the primary modifier is written in tooltips: "⌘" on macOS, "Ctrl+" elsewhere. */
export const MOD = IS_MAC ? '⌘' : 'Ctrl+'

/** Cmd on macOS, Ctrl elsewhere, with no other modifier except, optionally, Shift. */
export function isPrimary(e: KeyboardEvent, shift = false): boolean {
  const primary = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  return primary && !e.altKey && e.shiftKey === shift
}

/** True while typing in a text field, where plain keys and Cmd+Z belong to the field. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], .xterm')
}

/** True inside the terminal or the built-in editor, which keep their own Cmd and Ctrl keys. */
export function ownsModifierKeys(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el?.closest?.('.xterm, .monaco-editor')
}

/** Ranks `label` against a palette query: every word must appear; earlier and word-start matches rank higher. */
export function matchScore(label: string, query: string): number | null {
  const text = label.toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  let score = 0
  for (const word of words) {
    const at = text.indexOf(word)
    if (at === -1) return null
    const wordStart = at === 0 || /[\s/:._-]/.test(text[at - 1])
    score += at + (wordStart ? 0 : 20)
  }
  return score
}
