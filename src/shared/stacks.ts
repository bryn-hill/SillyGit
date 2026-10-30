// Stacked branches: a branch can name another as its parent, so a feature
// split into several small branches (each built on the one before) can be
// kept up to date in one go. The parent and the commit the branch was last
// based on live in the repo's git config, next to the branch's tracking
// settings, so they move with renames and go away with deletes.

/** `branch.<name>.<key>`: the branch the stack builds it on. */
export const PARENT_KEY = 'sillygit-parent'
/** `branch.<name>.<key>`: the parent's tip when the branch was last stacked or restacked on it. */
export const BASE_KEY = 'sillygit-base'

/** A branch's place in a stack, as the side bar lists it. */
export interface StackBranch {
  name: string
  parent: string
  /** 0 for the stack's bottom branch, which sits on the trunk. */
  depth: number
  /** The parent has moved on since this branch was built on it. */
  needsRestack: boolean
  /** The parent branch is gone (deleted outside SillyGit). */
  parentMissing: boolean
  /** Commits on the branch that aren't on its parent. */
  ahead: number
}

/** One stack: a bottom branch on the trunk and everything built on it, parents before children. */
export interface StackInfo {
  /** The bottom branch's name, which names the stack. */
  id: string
  /** The branch the stack sits on, e.g. main. Not part of the stack itself. */
  trunk: string
  branches: StackBranch[]
}

/** What a restack did: the branches it rebased, and the one it stopped on with conflicts. */
export interface RestackResult {
  restacked: string[]
  conflicts: boolean
  stoppedAt: string | null
  /** Uncommitted changes set aside before restacking and not put back, because it stopped. */
  stashed: boolean
}

interface Node {
  name: string
  parent: string
  depth: number
}

/**
 * Groups branches with a parent into stacks. A branch whose parent has no
 * parent of its own (or is gone) is a stack's bottom, and its parent the
 * trunk. Children come straight after their parent, alphabetically, so a
 * stack reads top to bottom as it's built. Branches in a parent loop (only
 * possible by editing git config by hand) are left out.
 */
export function groupStacks(parents: Record<string, string>, existing: ReadonlySet<string>): { id: string; trunk: string; nodes: Node[] }[] {
  const children = new Map<string, string[]>()
  for (const [child, parent] of Object.entries(parents)) {
    if (!existing.has(child)) continue
    children.set(parent, [...(children.get(parent) ?? []), child])
  }
  for (const list of children.values()) list.sort((a, b) => a.localeCompare(b))

  const isBottom = (name: string): boolean => !existing.has(parents[name]) || !(parents[name] in parents)

  const stacks: { id: string; trunk: string; nodes: Node[] }[] = []
  const bottoms = Object.keys(parents)
    .filter((name) => existing.has(name) && isBottom(name))
    .sort((a, b) => a.localeCompare(b))
  for (const bottom of bottoms) {
    const nodes: Node[] = []
    const seen = new Set<string>()
    const visit = (name: string, depth: number): void => {
      if (seen.has(name)) return
      seen.add(name)
      nodes.push({ name, parent: parents[name], depth })
      for (const child of children.get(name) ?? []) visit(child, depth + 1)
    }
    visit(bottom, 0)
    stacks.push({ id: bottom, trunk: parents[bottom], nodes })
  }
  return stacks
}

/** The stack a branch belongs to, if any. */
export function stackOf<T extends { branches: { name: string }[] }>(stacks: T[], branch: string | null | undefined): T | null {
  if (!branch) return null
  return stacks.find((s) => s.branches.some((b) => b.name === branch)) ?? null
}

/** Whether making `parent` the parent of `branch` would loop back to `branch`. */
export function wouldLoop(parents: Record<string, string>, branch: string, parent: string): boolean {
  let at: string | undefined = parent
  const seen = new Set<string>()
  while (at !== undefined && !seen.has(at)) {
    if (at === branch) return true
    seen.add(at)
    at = parents[at]
  }
  return false
}
