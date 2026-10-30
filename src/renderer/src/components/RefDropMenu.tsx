import { useState, type JSX } from 'react'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import RefDragLayer from './RefDrag'
import { shortRef } from './RefContextMenu'
import { dropOptions, squashOptions, type DragSource, type DropOption, type DropTarget } from '../lib/refDrag'

interface DropMenu {
  x: number
  y: number
  source: DragSource
  target: DropTarget
  /** Options for the branch, then for the commit; empty sections are left out. */
  sections: DropOption[][]
}

function menuItem(option: DropOption, pick: (option: DropOption) => void): ContextMenuItem {
  return {
    id: option.submenu ? `${option.action}-with` : option.strategy ? `${option.action}-${option.strategy}` : option.action,
    label: option.label,
    title: option.title,
    disabled: option.disabled,
    ...(option.submenu
      ? { submenu: option.submenu.map((o) => menuItem(o, pick)) }
      : { onSelect: () => pick(option) })
  }
}

/**
 * Drag and drop on the graph and sidebar: runs the drags, and when one is let
 * go over a branch, offers what can be done there (fast-forward, merge,
 * rebase, cherry-pick) in a menu where it landed; commits let go over
 * another commit can be squashed into it.
 */
export default function RefDropMenu({
  repoPath,
  canSquash,
  onError,
  onPick
}: {
  repoPath: string | null
  /** Whether `sources` can be squashed into `target`: all on the checked-out branch. */
  canSquash: (sources: string[], target: string) => boolean
  onError: (message: string) => void
  onPick: (source: DragSource, target: DropTarget, option: DropOption) => void
}): JSX.Element {
  const [menu, setMenu] = useState<DropMenu | null>(null)

  const handleDrop = async (source: DragSource, target: DropTarget, x: number, y: number): Promise<void> => {
    if (!repoPath) return
    let branchOptions: DropOption[] = []
    if (target.branch) {
      // For several commits, the newest decides whether the branch already has them.
      const from = source.kind === 'branch' ? source.name : source.hashes[source.hashes.length - 1]
      const res = await window.api.dropRelation(repoPath, from, target.branch)
      if (!res.ok) {
        onError(res.error)
        return
      }
      branchOptions = dropOptions(source, target.branch, res.data, shortRef)
    }
    const commitOptions =
      target.commit && source.kind === 'commits'
        ? squashOptions(source, target.commit, canSquash(source.hashes, target.commit))
        : []
    const sections = [branchOptions, commitOptions].filter((section) => section.length > 0)
    if (sections.length > 0) setMenu({ x, y, source, target, sections })
  }

  return (
    <>
      <RefDragLayer onDrop={handleDrop} />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sections={menu.sections.map((section) =>
            section.map((option) => menuItem(option, (o) => onPick(menu.source, menu.target, o)))
          )}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
