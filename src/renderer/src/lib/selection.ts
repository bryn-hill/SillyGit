import type { ClickModifiers } from '../components/CommitGraph'

// 'none' means nothing is selected and the side bar is closed. 'commits' is a
// multi-selection (newest first); `anchor` is where a Shift-click range starts.
export type Selection =
  | { type: 'none' }
  | { type: 'working' }
  | { type: 'commit'; hash: string }
  | { type: 'commits'; hashes: string[]; anchor: string }

/** The commits a selection covers, for highlighting rows. */
export function selectedHashes(selection: Selection): Set<string> {
  if (selection.type === 'commit') return new Set([selection.hash])
  if (selection.type === 'commits') return new Set(selection.hashes)
  return new Set()
}

function fromHashes(hashes: string[], anchor: string): Selection {
  if (hashes.length === 0) return { type: 'none' }
  if (hashes.length === 1) return { type: 'commit', hash: hashes[0] }
  return { type: 'commits', hashes, anchor }
}

/**
 * The selection after clicking a commit row, GitKraken style: a plain click
 * selects just that commit (or clears it if it was the only one selected),
 * Cmd/Ctrl-click adds or removes it, and Shift-click selects the range from
 * the last clicked commit. `order` is every loaded commit, newest first;
 * multi-selections keep that order.
 */
export function clickCommit(
  selection: Selection,
  hash: string,
  modifiers: ClickModifiers,
  order: string[]
): Selection {
  const current = selection.type === 'commit' ? [selection.hash] : selection.type === 'commits' ? selection.hashes : []
  const anchor =
    selection.type === 'commit' ? selection.hash : selection.type === 'commits' ? selection.anchor : null
  const sorted = (hashes: Iterable<string>): string[] => {
    const set = new Set(hashes)
    return order.filter((h) => set.has(h))
  }

  if (modifiers.range && anchor) {
    const from = order.indexOf(anchor)
    const to = order.indexOf(hash)
    if (from !== -1 && to !== -1) {
      const range = order.slice(Math.min(from, to), Math.max(from, to) + 1)
      // Cmd+Shift adds the range to what's already selected.
      const hashes = modifiers.toggle ? sorted([...current, ...range]) : range
      return fromHashes(hashes, anchor)
    }
  }

  if (modifiers.toggle || modifiers.range) {
    const hashes = current.includes(hash) ? current.filter((h) => h !== hash) : sorted([...current, hash])
    return fromHashes(hashes, hash)
  }

  if (selection.type === 'commit' && selection.hash === hash) return { type: 'none' }
  return { type: 'commit', hash }
}

/**
 * Keeps a selection on something that exists: drops commits that went away
 * (e.g. after a rebase) and moves between the WIP row and the newest commit as
 * working changes come and go. Returns `selection` itself when it's fine.
 */
export function fixSelection(
  selection: Selection,
  hasCommit: (hash: string) => boolean,
  newestHash: string | null,
  hasWorkingChanges: boolean
): Selection {
  if (newestHash === null || selection.type === 'none') return selection
  if (selection.type === 'commits') {
    const kept = selection.hashes.filter(hasCommit)
    if (kept.length === selection.hashes.length) return selection
    return kept.length > 1
      ? { type: 'commits', hashes: kept, anchor: kept.includes(selection.anchor) ? selection.anchor : kept[0] }
      : kept.length === 1
        ? { type: 'commit', hash: kept[0] }
        : { type: 'none' }
  }
  const selectedExists = selection.type === 'commit' && hasCommit(selection.hash)
  if (!hasWorkingChanges && (selection.type === 'working' || !selectedExists)) {
    return { type: 'commit', hash: newestHash }
  }
  if (hasWorkingChanges && selection.type === 'commit' && !selectedExists) return { type: 'working' }
  return selection
}

/**
 * The row ArrowUp (-1) or ArrowDown (+1) moves to: the WIP row first when
 * there is one, then the commits newest first. Null when there are no rows.
 */
export function stepSelection(
  selection: Selection,
  order: string[],
  hasWorkingChanges: boolean,
  delta: -1 | 1
): Selection | null {
  const items: Selection[] = [
    ...(hasWorkingChanges ? [{ type: 'working' } as const] : []),
    ...order.map((hash) => ({ type: 'commit', hash }) as const)
  ]
  if (items.length === 0) return null
  const focusedHash =
    selection.type === 'commit' ? selection.hash : selection.type === 'commits' ? selection.anchor : null
  const current = items.findIndex((item) =>
    item.type === 'commit' ? focusedHash === item.hash : selection.type === item.type
  )
  const next = current === -1 ? 0 : Math.min(items.length - 1, Math.max(0, current + delta))
  return items[next]
}
