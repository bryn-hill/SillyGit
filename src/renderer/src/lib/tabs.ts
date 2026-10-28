// Repo tab ordering, kept pure so the rules are easy to follow and test.
// `tabs` lists every open repo with the pinned ones first.

/** `tabs` with `path` added at the end, or in place of `active` when `replace` is set. */
export function openTab(tabs: string[], path: string, active: string | null, replace: boolean): string[] {
  if (tabs.includes(path)) return tabs
  const at = active ? tabs.indexOf(active) : -1
  if (replace && at !== -1) return tabs.map((p, i) => (i === at ? path : p))
  return [...tabs, path]
}

/** The tab that takes over when `closing` includes the active one: like a browser, the one to the right, else the left. */
export function tabAfterClosing(tabs: string[], active: string, closing: string[]): string | null {
  const index = tabs.indexOf(active)
  return (
    tabs.slice(index + 1).find((p) => !closing.includes(p)) ??
    [...tabs.slice(0, index)].reverse().find((p) => !closing.includes(p)) ??
    null
  )
}

/**
 * Pins or unpins `path`. Pinned tabs sit together on the left, so pinning
 * moves a tab to the end of that group and unpinning to the start of the rest.
 */
export function togglePinnedTab(tabs: string[], pinned: string[], path: string): { tabs: string[]; pinned: string[] } {
  const pinning = !pinned.includes(path)
  const nextPinned = pinning ? [...pinned, path] : pinned.filter((p) => p !== path)
  const pinnedInOrder = pinning ? nextPinned : tabs.filter((p) => nextPinned.includes(p))
  return {
    pinned: pinnedInOrder,
    tabs: [...pinnedInOrder, ...(pinning ? [] : [path]), ...tabs.filter((p) => !nextPinned.includes(p) && p !== path)]
  }
}

/** `tabs` with `path` moved before `before`, or to the end of its own group (pinned or not) when that's null. */
export function moveTab(tabs: string[], pinned: string[], path: string, before: string | null): string[] {
  const without = tabs.filter((p) => p !== path)
  if (before !== null) {
    without.splice(without.indexOf(before), 0, path)
    return without
  }
  const lastPinned = without.reduce((last, p, i) => (pinned.includes(p) ? i : last), -1)
  without.splice(pinned.includes(path) ? lastPinned + 1 : without.length, 0, path)
  return without
}

/** The tab `offset` places along from `active`, wrapping around; null with no tabs. */
export function cycleTab(tabs: string[], active: string | null, offset: number): string | null {
  if (tabs.length === 0) return null
  const index = active ? tabs.indexOf(active) : -1
  return tabs[(index + offset + tabs.length) % tabs.length]
}

/** Cmd+1 to Cmd+8 pick that tab and Cmd+9 the last one, like a browser. */
export function tabForDigit(tabs: string[], n: number): string | undefined {
  return n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]
}
