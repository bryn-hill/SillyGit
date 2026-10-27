/**
 * Works out how to undo the last thing that moved HEAD, from reflog entries,
 * like GitKraken's Undo button. Pure, so it can be tested without a repo.
 */

export type UndoPlan =
  /** Check the previous branch (or commit) out again. */
  | { kind: 'checkout'; target: string; label: string }
  /**
   * Move the branch back to where it was before. `soft` keeps the undone
   * commit's changes staged; `keep` moves the working tree too but refuses to
   * touch uncommitted changes; `keep-or-mixed` falls back to a mixed reset
   * when `keep` refuses, which never touches the working tree.
   */
  | { kind: 'reset'; mode: 'soft' | 'keep' | 'keep-or-mixed'; label: string }

function quote(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > 50 ? `“${trimmed.slice(0, 49)}…”` : `“${trimmed}”`
}

/**
 * `headSubject` is the newest HEAD reflog subject (`%gs`), `refSubject` the
 * newest one for the checked-out branch, or for HEAD when it's detached.
 * Returns null when there's nothing we know how to undo safely.
 */
export function planUndo(headSubject: string | null, refSubject: string | null): UndoPlan | null {
  const checkout = headSubject?.match(/^checkout: moving from (.+) to (.+)$/)
  if (checkout) {
    const [, from, to] = checkout
    if (from === to) return null
    return { kind: 'checkout', target: from, label: `Undo checkout of ${to}` }
  }

  if (!refSubject) return null
  const colon = refSubject.indexOf(': ')
  const action = colon === -1 ? refSubject : refSubject.slice(0, colon)
  const detail = colon === -1 ? '' : refSubject.slice(colon + 2)

  switch (action) {
    case 'commit':
      return { kind: 'reset', mode: 'soft', label: `Undo commit ${quote(detail)}` }
    case 'commit (amend)':
      return { kind: 'reset', mode: 'soft', label: `Undo amend of ${quote(detail)}` }
    case 'commit (merge)':
      return { kind: 'reset', mode: 'keep', label: 'Undo merge' }
    case 'cherry-pick':
      return { kind: 'reset', mode: 'keep', label: `Undo cherry-pick of ${quote(detail)}` }
    case 'revert':
      return { kind: 'reset', mode: 'keep', label: `Undo revert ${quote(detail)}` }
    case 'reset':
      return { kind: 'reset', mode: 'keep-or-mixed', label: 'Undo reset' }
    default:
      // "merge feature: Fast-forward", "merge feature: Merge made by the 'ort' strategy."
      if (action.startsWith('merge ')) return { kind: 'reset', mode: 'keep', label: `Undo merge of ${action.slice(6)}` }
      if (action.startsWith('pull')) return { kind: 'reset', mode: 'keep', label: 'Undo pull' }
      if (action.startsWith('rebase')) return { kind: 'reset', mode: 'keep', label: 'Undo rebase' }
      // "commit (initial)" has nothing to go back to; branch creation, fetch
      // and the rest aren't undone here.
      return null
  }
}
