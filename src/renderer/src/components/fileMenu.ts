import { lfsTrackOptions } from '../../../shared/lfs'
import { ignoreOptions } from '../../../shared/gitignore'
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
  /** Opens the file in the user's code editor, named by `editorName`. */
  onOpenInEditor?: () => void
  editorName?: string | null
  onCopyPath?: () => void
  /** Stashes just this file (working changes). */
  onStash?: () => void
  /** Offers "Track with LFS" (in the working tree): whether git-lfs is installed, the file is already in LFS, and how to track a pattern. */
  lfs?: { installed: boolean; tracked: boolean; onTrack: (pattern: string) => void }
  /** Offers "Ignore" for an untracked file: adds the chosen pattern to the repo's .gitignore. */
  onIgnore?: (pattern: string) => void
  /** Takes the file's changes out of the commit (one of the checked-out branch's) into the working tree. */
  onUncommit?: () => void
  /** The user's custom commands for files. */
  custom?: ContextMenuItem[]
}

/** The right-click menu for a file in a commit or the working tree, like GitKraken's. */
export function fileMenuSections(o: FileMenuOptions): ContextMenuItem[][] {
  const open: ContextMenuItem[] = []
  if (o.onOpenDiff) open.push({ id: 'diff', label: 'Open diff', onSelect: o.onOpenDiff })
  if (o.onEdit && !o.deleted) open.push({ id: 'edit', label: 'Edit file', onSelect: o.onEdit })
  if (o.onOpenInEditor && o.editorName) {
    open.push({ id: 'open-in-editor', label: `Open in ${o.editorName}`, disabled: o.deleted, onSelect: o.onOpenInEditor })
  }
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
  const stash: ContextMenuItem[] = []
  if (o.onStash) stash.push({ id: 'stash', label: 'Stash this file…', onSelect: o.onStash })
  const copy: ContextMenuItem[] = []
  if (o.onCopyPath) copy.push({ id: 'copy-path', label: 'Copy file path', onSelect: o.onCopyPath })
  const tracking: ContextMenuItem[] = []
  if (o.lfs?.tracked) tracking.push({ id: 'lfs-tracked', label: 'Stored in Git LFS', disabled: true })
  else if (o.lfs && !o.lfs.installed) {
    tracking.push({ id: 'lfs-track', label: 'Track with LFS', disabled: true, title: 'Install Git LFS from git-lfs.com first' })
  } else if (o.lfs) {
    const { onTrack } = o.lfs
    tracking.push({
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
  if (o.onIgnore) {
    const onIgnore = o.onIgnore
    tracking.push({
      id: 'ignore',
      label: 'Ignore',
      submenu: ignoreOptions(o.path).map((option) => ({
        id: `ignore-${option.pattern}`,
        label: option.label,
        title: `Add ${option.pattern} to .gitignore`,
        onSelect: () => onIgnore(option.pattern)
      }))
    })
  }
  const rewrite: ContextMenuItem[] = []
  if (o.onUncommit) {
    rewrite.push({
      id: 'uncommit',
      label: 'Uncommit this file',
      title: 'Take this file’s changes out of the commit and put them back in your working changes',
      onSelect: o.onUncommit
    })
  }
  return [open, history, stash, rewrite, tracking, copy, o.custom ?? []].filter((section) => section.length > 0)
}
