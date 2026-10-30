import { useEffect, useState, type JSX } from 'react'
import { shortRemoteUrl } from '../../../shared/remotes'
import type { RepoRemote, SubmoduleInfo, TagInfo, WorktreeInfo } from '../../../shared/types'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import { pressable } from '../lib/pressable'

export interface SidebarListActions {
  selectCommit: (hash: string) => void
  /** Checks out a tag (detached) by name. */
  checkout: (ref: string) => void
  pushTag: (name: string) => void
  deleteTag: (name: string, remote: boolean) => void
  /** Opens a folder (a worktree or submodule) as a repo in its own tab. */
  openRepo: (path: string) => void
  reveal: (path: string) => void
  copyText: (text: string) => void
  removeWorktree: (worktree: WorktreeInfo) => void
  pruneWorktrees: () => void
  /** Updates one submodule, or every one when `path` is null. */
  updateSubmodules: (path: string | null) => void
  fetchRemote: (name: string) => void
  addRemote: () => void
  renameRemote: (remote: RepoRemote) => void
  /** Changes the fetch URL (and push URL with it), or only the push URL when `push` is set. */
  editRemoteUrl: (remote: RepoRemote, push: boolean) => void
  removeRemote: (remote: RepoRemote) => void
  openUrl: (url: string) => void
}

interface Lists {
  repoPath: string
  tags: TagInfo[]
  worktrees: WorktreeInfo[]
  submodules: SubmoduleInfo[]
}

interface Props {
  repoPath: string
  /** Changes whenever the repo is refreshed, so the lists reload. */
  refreshKey: unknown
  remotes: RepoRemote[]
  /** The side bar's branch filter, which tags follow too. */
  filter: string
  collapsed: Set<string>
  onToggle: (key: string) => void
  actions: SidebarListActions
}

const SUBMODULE_NOTE: Record<SubmoduleInfo['state'], string | null> = {
  ok: null,
  uninitialized: 'not checked out',
  modified: 'moved',
  conflict: 'conflict'
}

function folderName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path
}

function GroupHeader({
  id,
  label,
  count,
  collapsed,
  onToggle
}: {
  id: string
  label: string
  count: number
  collapsed: Set<string>
  onToggle: (key: string) => void
}): JSX.Element {
  return (
    <div className="tree-group-header" aria-expanded={!collapsed.has(id)} {...pressable(() => onToggle(id))}>
      <span className="tree-caret" aria-hidden="true">
        {collapsed.has(id) ? '▸' : '▾'}
      </span>
      {label}
      {count > 0 && <span className="tree-group-count">{count}</span>}
    </div>
  )
}

/**
 * The side bar's Remotes, Tags, Worktrees and Submodules groups. Worktrees show only
 * when there's a linked one, and Submodules only when the repo has any.
 */
export default function SidebarLists({ repoPath, refreshKey, remotes, filter, collapsed, onToggle, actions }: Props): JSX.Element {
  const [lists, setLists] = useState<Lists | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; sections: ContextMenuItem[][] } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([window.api.tags(repoPath), window.api.worktrees(repoPath), window.api.submodules(repoPath)]).then(
      ([tags, worktrees, submodules]) => {
        if (cancelled) return
        setLists({
          repoPath,
          tags: tags.ok ? tags.data : [],
          worktrees: worktrees.ok ? worktrees.data : [],
          submodules: submodules.ok ? submodules.data : []
        })
      }
    )
    return () => {
      cancelled = true
    }
  }, [repoPath, refreshKey])

  // Another repo's lists never show while this one's load.
  const shown = lists?.repoPath === repoPath ? lists : null
  const needle = filter.toLowerCase()
  const hasRemotes = remotes.length > 0
  const shownRemotes = remotes.filter((r) => r.name.toLowerCase().includes(needle))
  const tags = (shown?.tags ?? []).filter((t) => t.name.toLowerCase().includes(needle))
  const worktrees = shown?.worktrees ?? []
  const submodules = shown?.submodules ?? []

  const openMenu = (e: React.MouseEvent, sections: ContextMenuItem[][]): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, sections })
  }

  const remoteMenu = (remote: RepoRemote): ContextMenuItem[][] => {
    const sections: ContextMenuItem[][] = [
      [{ id: 'fetch', label: `Fetch ${remote.name}`, onSelect: () => actions.fetchRemote(remote.name) }],
      [
        { id: 'edit-url', label: 'Edit URL…', onSelect: () => actions.editRemoteUrl(remote, false) },
        ...(remote.pushUrl ? [{ id: 'edit-push-url', label: 'Edit push URL…', onSelect: () => actions.editRemoteUrl(remote, true) }] : []),
        { id: 'rename', label: 'Rename…', onSelect: () => actions.renameRemote(remote) }
      ]
    ]
    const copy: ContextMenuItem[] = []
    if (remote.url) copy.push({ id: 'copy', label: 'Copy URL', onSelect: () => actions.copyText(remote.url!) })
    if (remote.webUrl) copy.push({ id: 'open', label: 'Open on the web', onSelect: () => actions.openUrl(remote.webUrl!) })
    if (copy.length) sections.push(copy)
    sections.push([{ id: 'remove', label: `Remove ${remote.name}…`, danger: true, onSelect: () => actions.removeRemote(remote) }])
    return sections
  }

  const tagMenu = (tag: TagInfo): ContextMenuItem[][] => [
    [
      { id: 'checkout', label: `Check out ${tag.name}`, onSelect: () => actions.checkout(tag.name) },
      ...(hasRemotes ? [{ id: 'push', label: `Push ${tag.name} to remote`, onSelect: () => actions.pushTag(tag.name) }] : [])
    ],
    [{ id: 'copy', label: 'Copy tag name', onSelect: () => actions.copyText(tag.name) }],
    [
      { id: 'delete', label: `Delete ${tag.name}`, danger: true, onSelect: () => actions.deleteTag(tag.name, false) },
      ...(hasRemotes
        ? [
            {
              id: 'delete-remote',
              label: `Delete ${tag.name} here and on remote`,
              danger: true,
              onSelect: () => actions.deleteTag(tag.name, true)
            }
          ]
        : [])
    ]
  ]

  const worktreeMenu = (wt: WorktreeInfo): ContextMenuItem[][] => {
    const open: ContextMenuItem[] = []
    if (!wt.current && !wt.prunable) open.push({ id: 'open', label: 'Open in a new tab', onSelect: () => actions.openRepo(wt.path) })
    if (!wt.prunable) open.push({ id: 'reveal', label: 'Show in file manager', onSelect: () => actions.reveal(wt.path) })
    open.push({ id: 'copy', label: 'Copy path', onSelect: () => actions.copyText(wt.path) })
    const sections = [open]
    if (wt.prunable) sections.push([{ id: 'prune', label: 'Prune missing worktrees', onSelect: actions.pruneWorktrees }])
    else if (!wt.main && !wt.current) {
      sections.push([{ id: 'remove', label: 'Remove worktree…', danger: true, onSelect: () => actions.removeWorktree(wt) }])
    }
    return sections
  }

  const submoduleMenu = (sm: SubmoduleInfo): ContextMenuItem[][] => {
    const full = `${repoPath.replace(/[\\/]+$/, '')}/${sm.path}`
    const sections: ContextMenuItem[][] = [
      [
        {
          id: 'update',
          label: sm.state === 'uninitialized' ? 'Check out submodule' : 'Update to recorded commit',
          onSelect: () => actions.updateSubmodules(sm.path)
        },
        { id: 'update-all', label: 'Update all submodules', onSelect: () => actions.updateSubmodules(null) }
      ]
    ]
    if (sm.state !== 'uninitialized') {
      sections.push([
        { id: 'open', label: 'Open in a new tab', onSelect: () => actions.openRepo(full) },
        { id: 'reveal', label: 'Show in file manager', onSelect: () => actions.reveal(full) }
      ])
    }
    sections.push([{ id: 'copy', label: 'Copy path', onSelect: () => actions.copyText(sm.path) }])
    return sections
  }

  return (
    <>
      <GroupHeader id="remotes-root" label="REMOTES" count={remotes.length} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed.has('remotes-root') && (
        <ul className="side-list" aria-label="Remotes">
          {shownRemotes.length === 0 && filter && <li className="stash-empty">No matching remotes</li>}
          {shownRemotes.map((remote) => (
            <li
              key={remote.name}
              className="tree-row side-list-row"
              title={`${remote.name}: ${remote.url ?? ''}${remote.pushUrl ? `\nPushes to ${remote.pushUrl}` : ''}\nClick to fetch, right-click for more`}
              {...pressable(() => actions.fetchRemote(remote.name))}
              onContextMenu={(e) => openMenu(e, remoteMenu(remote))}
            >
              <span className="side-list-icon" aria-hidden="true">
                ⇅
              </span>
              <span className="side-list-name">{remote.name}</span>
              {remote.url && <span className="side-list-note side-list-url">{shortRemoteUrl(remote.url)}</span>}
            </li>
          ))}
          <li className="tree-row side-list-row side-list-add" {...pressable(actions.addRemote)}>
            <span className="side-list-icon" aria-hidden="true">
              +
            </span>
            <span className="side-list-name">Add remote…</span>
          </li>
        </ul>
      )}

      <GroupHeader id="tag-root" label="TAGS" count={tags.length} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed.has('tag-root') && (
        <ul className="side-list" aria-label="Tags">
          {tags.length === 0 && <li className="stash-empty">{filter ? 'No matching tags' : 'No tags'}</li>}
          {tags.map((tag) => (
            <li
              key={tag.name}
              className="tree-row side-list-row"
              title={`${tag.name}${tag.annotated ? ' (annotated)' : ''}: ${tag.subject}\nDouble-click to check out, right-click for more`}
              {...pressable(() => actions.selectCommit(tag.hash))}
              onDoubleClick={() => actions.checkout(tag.name)}
              onContextMenu={(e) => openMenu(e, tagMenu(tag))}
            >
              <span className="side-list-icon" aria-hidden="true">
                ◆
              </span>
              <span className="side-list-name">{tag.name}</span>
            </li>
          ))}
        </ul>
      )}

      {worktrees.length > 1 && (
        <>
          <GroupHeader id="worktree-root" label="WORKTREES" count={worktrees.length} collapsed={collapsed} onToggle={onToggle} />
          {!collapsed.has('worktree-root') && (
            <ul className="side-list" aria-label="Worktrees">
              {worktrees.map((wt) => (
                <li
                  key={wt.path}
                  className={`tree-row side-list-row ${wt.current ? 'current' : ''} ${wt.prunable ? 'missing' : ''}`}
                  title={`${wt.path}${wt.current ? '\nOpen in this tab' : wt.prunable ? '\nIts folder is gone' : '\nClick to open in a new tab'}`}
                  {...pressable(() => {
                    if (!wt.current && !wt.prunable) actions.openRepo(wt.path)
                  })}
                  onContextMenu={(e) => openMenu(e, worktreeMenu(wt))}
                >
                  <span className="side-list-icon" aria-hidden="true">
                    {wt.current ? '●' : '○'}
                  </span>
                  <span className="side-list-name">
                    {wt.branch ?? (wt.head ? `detached at ${wt.head.slice(0, 7)}` : 'detached')}
                  </span>
                  <span className="side-list-note">
                    {wt.prunable ? 'missing' : wt.main ? 'main' : folderName(wt.path)}
                    {wt.locked && ' · locked'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {submodules.length > 0 && (
        <>
          <GroupHeader id="submodule-root" label="SUBMODULES" count={submodules.length} collapsed={collapsed} onToggle={onToggle} />
          {!collapsed.has('submodule-root') && (
            <ul className="side-list" aria-label="Submodules">
              {submodules.map((sm) => (
                <li
                  key={sm.path}
                  className="tree-row side-list-row"
                  title={`${sm.path} at ${sm.hash.slice(0, 7)}\nClick to ${sm.state === 'uninitialized' ? 'check it out' : 'open it in a new tab'}`}
                  {...pressable(() =>
                    sm.state === 'uninitialized'
                      ? actions.updateSubmodules(sm.path)
                      : actions.openRepo(`${repoPath.replace(/[\\/]+$/, '')}/${sm.path}`)
                  )}
                  onContextMenu={(e) => openMenu(e, submoduleMenu(sm))}
                >
                  <span className="side-list-icon" aria-hidden="true">
                    ▣
                  </span>
                  <span className="side-list-name">{sm.path}</span>
                  {SUBMODULE_NOTE[sm.state] && (
                    <span className={`side-list-note submodule-${sm.state}`}>{SUBMODULE_NOTE[sm.state]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} sections={menu.sections} onClose={() => setMenu(null)} />}
    </>
  )
}
