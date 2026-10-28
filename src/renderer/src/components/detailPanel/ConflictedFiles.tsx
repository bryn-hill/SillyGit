import { useEffect, useMemo, useState, type JSX } from 'react'
import type { FileStatus, OperationState } from '../../../../shared/types'
import ContextMenu, { type ContextMenuItem } from '../ContextMenu'
import { MOD } from '../../lib/shortcuts'
import type { ConflictActions } from './types'

/**
 * The conflicted files of a merge, rebase, cherry-pick or revert in progress.
 * Click opens one in the merge tool; Cmd/Ctrl- and Shift-click pick several
 * for bulk actions from the right-click menu.
 */
export default function ConflictedFiles({
  conflicted,
  operation,
  actions
}: {
  conflicted: FileStatus[]
  operation: OperationState | null
  actions: ConflictActions
}): JSX.Element | null {
  const [conflictMenu, setConflictMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  // Conflicted files picked with Cmd/Ctrl- or Shift-click, for bulk actions.
  const [pickedConflicts, setSelectedConflicts] = useState<string[]>([])
  const [conflictAnchor, setConflictAnchor] = useState<string | null>(null)

  const conflictedKey = conflicted.map((f) => f.path).join('\0')
  // Selected files drop out once they're resolved.
  const selectedConflicts = useMemo(() => {
    const paths = new Set(conflictedKey.split('\0'))
    return pickedConflicts.every((p) => paths.has(p)) ? pickedConflicts : pickedConflicts.filter((p) => paths.has(p))
  }, [pickedConflicts, conflictedKey])
  const selectedSet = new Set(selectedConflicts)

  const clickConflict = (e: React.MouseEvent, path: string): void => {
    const order = conflicted.map((f) => f.path)
    const toggle = e.metaKey || e.ctrlKey
    if (e.shiftKey && conflictAnchor && order.includes(conflictAnchor)) {
      const [a, b] = [order.indexOf(conflictAnchor), order.indexOf(path)].sort((x, y) => x - y)
      const range = order.slice(a, b + 1)
      setSelectedConflicts(toggle ? order.filter((p) => selectedSet.has(p) || range.includes(p)) : range)
      return
    }
    if (toggle) {
      setSelectedConflicts(selectedSet.has(path) ? selectedConflicts.filter((p) => p !== path) : order.filter((p) => selectedSet.has(p) || p === path))
      setConflictAnchor(path)
      return
    }
    setSelectedConflicts([path])
    setConflictAnchor(path)
    actions.onOpenConflict(path)
  }

  // Cmd/Ctrl+D opens the selected conflicted file in the external merge tool.
  useEffect(() => {
    if (!actions.externalToolName || selectedConflicts.length !== 1) return
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'd' && !e.defaultPrevented) {
        e.preventDefault()
        actions.onOpenExternal(selectedConflicts[0])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [actions, selectedConflicts])

  const conflictMenuSections = (path: string): ContextMenuItem[][] => {
    // Right-clicking one of several selected files acts on all of them.
    const paths = selectedSet.has(path) && selectedConflicts.length > 1 ? selectedConflicts : [path]
    const n = paths.length
    const suffix = n > 1 ? ` ${n} files` : ''
    const open: ContextMenuItem[] =
      n > 1
        ? []
        : [
            ...(actions.externalToolName
              ? [
                  {
                    id: 'open-external',
                    label: `Open in ${actions.externalToolName}`,
                    title: `${MOD}D`,
                    onSelect: () => actions.onOpenExternal(path)
                  }
                ]
              : []),
            { id: 'open', label: 'Open in merge tool', onSelect: () => actions.onOpenConflict(path) }
          ]
    return [
      ...(open.length > 0 ? [open] : []),
      [
        {
          id: 'take-current',
          label: `Take current (${operation?.currentLabel ?? 'current'})${suffix}`,
          onSelect: () => actions.onTakeSide(paths, 'current')
        },
        {
          id: 'take-incoming',
          label: `Take incoming (${operation?.incomingLabel ?? 'incoming'})${suffix}`,
          onSelect: () => actions.onTakeSide(paths, 'incoming')
        }
      ],
      [{ id: 'resolve', label: n > 1 ? `Mark ${n} resolved` : 'Mark resolved', onSelect: () => actions.onMarkResolved(paths) }]
    ]
  }

  if (conflicted.length === 0) return null

  return (
    <>
      <div className="detail-section" role="region" aria-label="Conflicted files">
        <div className="detail-section-header">
          <span>Conflicted Files ({conflicted.length})</span>
          <button
            className="mark-resolved-button"
            onClick={() =>
              actions.onMarkResolved(selectedConflicts.length > 1 ? selectedConflicts : conflicted.map((f) => f.path))
            }
          >
            {selectedConflicts.length > 1 ? `Mark ${selectedConflicts.length} resolved` : 'Mark All Resolved'}
          </button>
        </div>
        <ul className="file-list">
          {conflicted.map((f) => (
            <li key={`c:${f.path}`}>
              <div
                className={`file-row conflict-row ${conflictMenu?.path === f.path ? 'context-target' : ''} ${
                  selectedSet.has(f.path) ? 'selected' : ''
                }`}
                aria-selected={selectedSet.has(f.path)}
                onClick={(e) => clickConflict(e, f.path)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setConflictMenu({ x: e.clientX, y: e.clientY, path: f.path })
                }}
              >
                <span className="status-code code-conflict" title={`Conflict (${f.index}${f.worktree})`}>
                  !
                </span>
                <span className="file-path">{f.path}</span>
                <span className="file-actions">
                  <button
                    className="icon-button"
                    title="Mark resolved"
                    onClick={(e) => {
                      e.stopPropagation()
                      actions.onMarkResolved([f.path])
                    }}
                  >
                    ✓
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {conflictMenu && (
        <ContextMenu
          x={conflictMenu.x}
          y={conflictMenu.y}
          sections={conflictMenuSections(conflictMenu.path)}
          onClose={() => setConflictMenu(null)}
        />
      )}
    </>
  )
}
