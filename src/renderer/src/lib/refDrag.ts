import type { DropRelation } from '../../../shared/types'

/** What's being dragged on the graph or sidebar. */
export type DragSource =
  | { kind: 'branch'; name: string; remote: boolean }
  /** Commits to cherry-pick, oldest first; `label` names them in menus. */
  | { kind: 'commits'; hashes: string[]; label: string }

/** Pixels the pointer must move before a press becomes a drag, so clicks and double-clicks still work. */
export const DRAG_THRESHOLD = 5

/** The attribute that marks an element as a drop target; its value is a local branch name. */
export const DROP_ATTR = 'data-drop-branch'

export type DropAction = 'fast-forward' | 'merge' | 'rebase' | 'cherry-pick'

export interface DropOption {
  action: DropAction
  label: string
  disabled?: boolean
  /** Why it's disabled, or the full text when the label is shortened. */
  title?: string
}

export function sourceName(source: DragSource): string {
  return source.kind === 'branch' ? source.name : source.label
}

/** The commits a drag of `hashes` (newest first, as the graph lists them) names: "1a2b3c4" or "3 commits". */
export function commitsLabel(hashes: string[]): string {
  return hashes.length === 1 ? hashes[0].slice(0, 7) : `${hashes.length} commits`
}

/** The branch a drop at `el` lands on, or null when there is none or it's the dragged branch itself. */
export function dropTargetOf(el: Element | null, source: DragSource): string | null {
  const target = el?.closest(`[${DROP_ATTR}]`)?.getAttribute(DROP_ATTR) ?? null
  if (!target) return null
  if (source.kind === 'branch' && source.name === target) return null
  return target
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
  if (!source.remote && !relation.sourceContainsTarget) options.push(option('rebase', (s, t) => `Rebase ${s} onto ${t}`))
  return options
}
