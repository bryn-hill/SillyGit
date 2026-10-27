import type { Selection } from '../App'
import type { ClickModifiers } from '../components/CommitGraph'

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
