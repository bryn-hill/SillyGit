// Single-step edits to older commits on the current branch: reword one,
// move one up or down, or squash commits into another. Each becomes an
// interactive rebase plan built here; the rebase itself runs as the rebase
// editor's does (src/main/rebase.ts). Commits are oldest first throughout.

import type { RebaseAction, RebaseStep } from './rebase'

/** Up is towards the branch tip (newer), down towards its base (older). */
export type MoveDirection = 'up' | 'down'

/** How squashed commits join the one they're dropped on: keeping their messages, or not. */
export type SquashMode = Extract<RebaseAction, 'squash' | 'fixup'>

const picks = (hashes: string[]): RebaseStep[] => hashes.map((hash) => ({ hash, action: 'pick' }))

/** Rewords `target`, the oldest commit in `hashes`, to `message`; the rest are replayed. */
export function rewordSteps(hashes: string[], target: string, message: string): RebaseStep[] {
  return hashes.map((hash) => (hash === target ? { hash, action: 'reword', message } : { hash, action: 'pick' }))
}

/**
 * Swaps `hash` with its neighbour in `direction`. `hashes` must start at
 * whichever of the two is older, so it holds both.
 */
export function moveSteps(hashes: string[], hash: string, direction: MoveDirection): RebaseStep[] {
  const i = hashes.indexOf(hash)
  const j = direction === 'up' ? i + 1 : i - 1
  if (i === -1 || j < 0 || j >= hashes.length) {
    throw new Error(direction === 'up' ? 'That commit is already the newest.' : 'That commit is already the oldest.')
  }
  const order = [...hashes]
  ;[order[i], order[j]] = [order[j], order[i]]
  return picks(order)
}

/**
 * Folds `sources` into `target`: they move to just after it, in their own
 * order, as squashes (messages kept) or fixups (target's message only). The
 * combined commit sits where `target` was.
 */
export function squashSteps(hashes: string[], sources: string[], target: string, mode: SquashMode): RebaseStep[] {
  const moving = new Set(sources)
  if (moving.has(target)) throw new Error('A commit can’t be squashed into itself.')
  if (!hashes.includes(target) || sources.some((s) => !hashes.includes(s))) {
    throw new Error('Those commits aren’t all on the current branch.')
  }
  const steps: RebaseStep[] = []
  for (const hash of hashes) {
    if (moving.has(hash)) continue
    steps.push({ hash, action: 'pick' })
    if (hash === target) {
      for (const source of hashes.filter((h) => moving.has(h))) steps.push({ hash: source, action: mode })
    }
  }
  return steps
}
