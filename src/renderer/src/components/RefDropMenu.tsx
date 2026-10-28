import { useState, type JSX } from 'react'
import ContextMenu from './ContextMenu'
import RefDragLayer from './RefDrag'
import { shortRef } from './RefContextMenu'
import { dropOptions, type DragSource, type DropOption } from '../lib/refDrag'

interface DropMenu {
  x: number
  y: number
  source: DragSource
  target: string
  options: DropOption[]
}

/**
 * Drag and drop on the graph and sidebar: runs the drags, and when one is let
 * go over a branch, offers what can be done there (fast-forward, merge,
 * rebase, cherry-pick) in a menu where it landed.
 */
export default function RefDropMenu({
  repoPath,
  onError,
  onPick
}: {
  repoPath: string | null
  onError: (message: string) => void
  onPick: (source: DragSource, target: string, option: DropOption) => void
}): JSX.Element {
  const [menu, setMenu] = useState<DropMenu | null>(null)

  const handleDrop = async (source: DragSource, target: string, x: number, y: number): Promise<void> => {
    if (!repoPath) return
    // For several commits, the newest decides whether the branch already has them.
    const from = source.kind === 'branch' ? source.name : source.hashes[source.hashes.length - 1]
    const res = await window.api.dropRelation(repoPath, from, target)
    if (!res.ok) {
      onError(res.error)
      return
    }
    setMenu({ x, y, source, target, options: dropOptions(source, target, res.data, shortRef) })
  }

  return (
    <>
      <RefDragLayer onDrop={handleDrop} />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sections={[
            menu.options.map((option) => ({
              id: option.action,
              label: option.label,
              title: option.title,
              disabled: option.disabled,
              onSelect: () => onPick(menu.source, menu.target, option)
            }))
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
