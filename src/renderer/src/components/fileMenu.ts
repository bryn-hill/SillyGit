import { lfsTrackOptions } from '../../../shared/lfs'
import type { ContextMenuItem } from './ContextMenu'

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
  onCopyPath?: () => void
  /** Offers "Track with LFS" (in the working tree): whether git-lfs is installed, the file is already in LFS, and how to track a pattern. */
  lfs?: { installed: boolean; tracked: boolean; onTrack: (pattern: string) => void }
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
  const copy: ContextMenuItem[] = []
  if (o.onCopyPath) copy.push({ id: 'copy-path', label: 'Copy file path', onSelect: o.onCopyPath })
  const lfs: ContextMenuItem[] = []
  if (o.lfs?.tracked) lfs.push({ id: 'lfs-tracked', label: 'Stored in Git LFS', disabled: true })
  else if (o.lfs && !o.lfs.installed) {
    lfs.push({ id: 'lfs-track', label: 'Track with LFS', disabled: true, title: 'Install Git LFS from git-lfs.com first' })
  } else if (o.lfs) {
    const { onTrack } = o.lfs
    lfs.push({
      id: 'lfs-track',
      label: 'Track with LFS',
      submenu: lfsTrackOptions(o.path).map((option) => ({
        id: `lfs-track-${option.pattern}`,
        label: option.label,
        title: `git lfs track "${option.pattern}"`,
        onSelect: () => onTrack(option.pattern)
      }))
    })
  }
  return [open, history, lfs, copy, o.custom ?? []].filter((section) => section.length > 0)
}
