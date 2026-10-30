import type { JSX } from 'react'
import type { StackInfo } from '../../../shared/stacks'
import type { BranchInfo } from '../../../shared/types'
import { pressable } from '../lib/pressable'

interface Props {
  stacks: StackInfo[]
  branches: BranchInfo[]
  filter: string
  collapsed: Set<string>
  onToggle: (key: string) => void
  onSelect: (branch: BranchInfo) => void
  onCheckout: (branch: BranchInfo) => void
  onContextMenu: (e: React.MouseEvent, branch: BranchInfo) => void
  onRestack: (branch: string) => void
}

/**
 * The side bar's Stacks group: each stack's branches, bottom first and
 * indented under their parents, marking the ones whose parent has moved on.
 * Shows only when the repo has a stack.
 */
export default function SidebarStacks({
  stacks,
  branches,
  filter,
  collapsed,
  onToggle,
  onSelect,
  onCheckout,
  onContextMenu,
  onRestack
}: Props): JSX.Element | null {
  const needle = filter.toLowerCase()
  const shown = stacks.filter((s) => s.branches.some((b) => b.name.toLowerCase().includes(needle)))
  if (stacks.length === 0) return null
  const byName = new Map(branches.filter((b) => !b.remote).map((b) => [b.name, b]))

  return (
    <>
      <div className="tree-group-header" aria-expanded={!collapsed.has('stack-root')} {...pressable(() => onToggle('stack-root'))}>
        <span className="tree-caret" aria-hidden="true">
          {collapsed.has('stack-root') ? '▸' : '▾'}
        </span>
        STACKS
        <span className="tree-group-count">{stacks.length}</span>
      </div>
      {!collapsed.has('stack-root') &&
        shown.map((stack) => {
          const stale = stack.branches.filter((b) => b.needsRestack).length
          return (
            <div key={stack.id} className="stack" role="group" aria-label={`Stack ${stack.id}`}>
              <div className="stack-header">
                <span className="stack-trunk" title={`The stack builds on ${stack.trunk}`}>
                  on {stack.trunk}
                </span>
                {stale > 0 && (
                  <button
                    className="stack-restack"
                    aria-label={`Restack ${stack.id}`}
                    title={`${stale} ${stale === 1 ? 'branch is' : 'branches are'} behind ${stale === 1 ? 'its parent' : 'their parents'}`}
                    onClick={() => onRestack(stack.id)}
                  >
                    Restack
                  </button>
                )}
              </div>
              <ul className="side-list" aria-label={`Branches in ${stack.id}`}>
                {stack.branches.map((b) => {
                  const info = byName.get(b.name)
                  if (!info) return null
                  return (
                    <li
                      key={b.name}
                      className={`tree-row side-list-row stack-row ${info.current ? 'current' : ''}`}
                      style={{ paddingLeft: 22 + b.depth * 14 }}
                      title={`${b.name}, stacked on ${b.parent}\nDouble-click to check out, right-click for more`}
                      {...pressable(() => onSelect(info))}
                      onDoubleClick={() => onCheckout(info)}
                      onContextMenu={(e) => onContextMenu(e, info)}
                    >
                      <span className="side-list-icon" aria-hidden="true">
                        {b.depth === 0 ? '┗' : '┣'}
                      </span>
                      <span className="side-list-name">{b.name}</span>
                      {b.ahead > 0 && (
                        <span className="stack-ahead" title={`${b.ahead} commit${b.ahead === 1 ? '' : 's'} on top of ${b.parent}`}>
                          {b.ahead}
                        </span>
                      )}
                      {b.parentMissing ? (
                        <span className="stack-chip stack-chip-warn" title={`${b.parent} is gone. Right-click to pick a new parent.`}>
                          parent gone
                        </span>
                      ) : (
                        b.needsRestack && (
                          <span className="stack-chip" title={`${b.parent} has moved on since ${b.name} was built on it`}>
                            needs restack
                          </span>
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
    </>
  )
}
