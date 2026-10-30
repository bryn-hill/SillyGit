import type { DropRelation } from '../../../shared/types'
import { MERGE_STRATEGY_CHOICES, type MergeStrategy } from '../../../shared/mergeOptions'

/** What's being dragged on the graph or sidebar. */
export type DragSource =
  | { kind: 'branch'; name: string; remote: boolean }
  /** Commits to cherry-pick, oldest first; `label` names them in menus. */
  | { kind: 'commits'; hashes: string[]; label: string }

/** Pixels the pointer must move before a press becomes a drag, so clicks and double-clicks still work. */
export const DRAG_THRESHOLD = 5

/** The attribute that marks an element as a drop target; its value is a local branch name. */
export const DROP_ATTR = 'data-drop-branch'

/** The attribute that marks a graph row as a drop target for squashing commits; its value is the commit. */
export const DROP_COMMIT_ATTR = 'data-drop-commit'

/** Where a drag was let go: on a local branch, a commit (a graph row), or a row that is both. */
export interface DropTarget {
  branch: string | null
  commit: string | null
}

export type DropAction = 'fast-forward' | 'merge' | 'rebase' | 'cherry-pick' | 'squash' | 'fixup'

export interface DropOption {
  action: DropAction
  label: string
  disabled?: boolean
  /** Why it's disabled, or the full text when the label is shortened. */
  title?: string
  /** Merge only: how to merge; git's default when left out. */
  strategy?: MergeStrategy
  /** Other ways to do it, shown as a submenu. */
  submenu?: DropOption[]
}

export function sourceName(source: DragSource): string {
  return source.kind === 'branch' ? source.name : source.label
}

/** The commits a drag of `hashes` (newest first, as the graph lists them) names: "1a2b3c4" or "3 commits". */
export function commitsLabel(hashes: string[]): string {
  return hashes.length === 1 ? hashes[0].slice(0, 7) : `${hashes.length} commits`
}

/**
 * What a drop at `el` lands on, or null for nothing: a branch (not the
 * dragged one), and for dragged commits also a commit they aren't among.
 */
export function dropTargetOf(el: Element | null, source: DragSource): DropTarget | null {
  const found = el?.closest(source.kind === 'commits' ? `[${DROP_ATTR}], [${DROP_COMMIT_ATTR}]` : `[${DROP_ATTR}]`)
  let branch = found?.getAttribute(DROP_ATTR) ?? null
  if (source.kind === 'branch' && source.name === branch) branch = null
  let commit = source.kind === 'commits' ? (found?.getAttribute(DROP_COMMIT_ATTR) ?? null) : null
  if (commit && source.kind === 'commits' && source.hashes.includes(commit)) commit = null
  return branch || commit ? { branch, commit } : null
}

/** How the drag ghost names a drop target. */
export function dropTargetName(target: DropTarget): string {
  return target.branch ?? target.commit?.slice(0, 7) ?? ''
}

/**
 * The squash options for commits dropped on `target`, another commit; both
 * must be on the checked-out branch (`canSquash`), else one disabled option says why.
 */
export function squashOptions(source: DragSource, target: string, canSquash: boolean): DropOption[] {
  if (source.kind !== 'commits') return []
  const into = target.slice(0, 7)
  if (!canSquash) {
    return [
      {
        action: 'squash',
        label: `Squash ${source.label} into ${into}`,
        disabled: true,
        title: 'Only commits of the checked-out branch, with no merge between them, can be squashed'
      }
    ]
  }
  return [
    { action: 'squash', label: `Squash ${source.label} into ${into}`, title: 'Combine the commits and keep all their messages' },
    { action: 'fixup', label: `Fix up ${into} with ${source.label}`, title: `Combine the commits and keep only ${into}'s message` }
  ]
}

/**
 * What the menu offers when `source` is dropped on the local branch `target`,
 * like GitKraken: fast-forward when the target is behind, merge, and rebase a
 * local branch; or cherry-pick dropped commits. `short` shortens long branch
 * names in labels; the title then has the whole text.
 */
export function dropOptions(
  source: DragSource,
  target: string,
  relation: DropRelation,
  short: (name: string) => string = (n) => n
): DropOption[] {
  const option = (action: DropAction, text: (s: string, t: string) => string, disabledWhy?: string): DropOption => {
    const full = text(sourceName(source), target)
    const label = text(short(sourceName(source)), short(target))
    const title = disabledWhy ?? (label === full ? undefined : full)
    return { action, label, ...(disabledWhy ? { disabled: true } : {}), ...(title ? { title } : {}) }
  }

  if (source.kind === 'commits') {
    const already = source.hashes.length === 1 && relation.targetContainsSource
    return [option('cherry-pick', (s, t) => `Cherry-pick ${s} onto ${t}`, already ? `${target} already has this commit` : undefined)]
  }

  if (relation.targetContainsSource) {
    return [option('merge', (s, t) => `${t} already has ${s}`, 'Nothing to merge')]
  }
  const options: DropOption[] = []
  if (relation.sourceContainsTarget) options.push(option('fast-forward', (s, t) => `Fast-forward ${t} to ${s}`))
  options.push(option('merge', (s, t) => `Merge ${s} into ${t}`))
  options.push({
    action: 'merge',
    label: `Merge ${short(sourceName(source))} into ${short(target)} with…`,
    submenu: MERGE_STRATEGY_CHOICES.map(({ strategy, label, hint }) => ({ action: 'merge', label, title: hint, strategy }))
  })
  if (!source.remote && !relation.sourceContainsTarget) options.push(option('rebase', (s, t) => `Rebase ${s} onto ${t}`))
  return options
}
