import type { ContextMenuItem } from './ContextMenu'
import { folderOf } from '../../../shared/historySearch'

interface FileMenuOptions {
  path: string
  /** Deleted (in that commit, or in the working tree): there is nothing to blame or edit. */
  deleted?: boolean
  /** Not committed yet: there is no history or blame. */
  untracked?: boolean
  onOpenDiff?: () => void
  onBlame?: () => void
  onHistory?: () => void
  onEdit?: () => void
  /** Narrows the graph to the commits touching a file or folder. */
  onFilterHistory?: (path: string) => void
  onCopyPath?: () => void
  /** The user's custom commands for files. */
  custom?: ContextMenuItem[]
}

/** The right-click menu for a file in a commit or the working tree, like GitKraken's. */
export function fileMenuSections(o: FileMenuOptions): ContextMenuItem[][] {
  const open: ContextMenuItem[] = []
  if (o.onOpenDiff) open.push({ id: 'diff', label: 'Open diff', onSelect: o.onOpenDiff })
  if (o.onEdit && !o.deleted) open.push({ id: 'edit', label: 'Edit file', onSelect: o.onEdit })
  const history: ContextMenuItem[] = []
  if (o.onBlame) history.push({ id: 'blame', label: 'Blame', disabled: o.deleted || o.untracked, onSelect: o.onBlame })
  if (o.onHistory) history.push({ id: 'history', label: 'File history', disabled: o.untracked, onSelect: o.onHistory })
  if (o.onFilterHistory) {
    const filter = o.onFilterHistory
    history.push({
      id: 'filter-file',
      label: 'Show commits to this file in graph',
      disabled: o.untracked,
      onSelect: () => filter(o.path)
    })
    const folder = folderOf(o.path)
    if (folder) history.push({ id: 'filter-folder', label: 'Show history of this folder', onSelect: () => filter(folder) })
  }
  const copy: ContextMenuItem[] = []
  if (o.onCopyPath) copy.push({ id: 'copy-path', label: 'Copy file path', onSelect: o.onCopyPath })
  return [open, history, copy, o.custom ?? []].filter((section) => section.length > 0)
}
