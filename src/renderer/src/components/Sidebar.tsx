import { useMemo, useState, type JSX } from 'react'
import type { BranchInfo, StashEntry } from '../../../shared/types'
import RefContextMenu, { type RefActions, type RefTarget } from './RefContextMenu'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import { dropTarget, useRefDrag } from './RefDrag'
import { pressable } from '../lib/pressable'
import { favouriteBranches, staleAge, type BranchListSettings } from '../../../shared/branchStatus'
import { CLEANUP_SNOOZE_DAYS, formatCount, tidyCount } from '../../../shared/branchCleanup'

interface TreeNode {
  name: string
  path: string
  fullName?: string
  info?: BranchInfo
  children: Map<string, TreeNode>
}

function buildTree(branches: BranchInfo[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map() }
  for (const b of branches) {
    const parts = b.name.split('/')
    let node = root
    let pathSoFar = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part
      const isLeaf = i === parts.length - 1
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: pathSoFar, children: new Map() })
      }
      node = node.children.get(part) as TreeNode
      if (isLeaf) {
        node.fullName = b.name
        node.info = b
      }
    }
  }
  return root
}

export interface StashActions {
  apply: (stash: StashEntry) => void
  pop: (stash: StashEntry) => void
  drop: (stash: StashEntry) => void
}

interface Props {
  branches: BranchInfo[]
  headHash: string | null
  onCheckout: (branch: string) => void
  onCreateBranch: (branch: string) => void
  /** A single click on a branch selects the commit it points at. */
  onSelectCommit: (hash: string) => void
  actions: RefActions
  stashes: StashEntry[]
  stashActions: StashActions
  /** Starred branch names, pinned above the rest. */
  favourites: string[]
  onToggleFavourite: (name: string) => void
  branchListSettings: BranchListSettings
  /** When `branches` was listed, in ms, to age the stale tags against. */
  listedAt: number
  /** The "can be tidied" banner was dismissed for a while. */
  cleanupSnoozed: boolean
  onOpenCleanup: () => void
  onSnoozeCleanup: () => void
}

/** "WIP on main: 1a2b3c4 Subject" -> "Subject"; "On main: my note" -> "my note". */
function stashTitle(message: string): string {
  const wip = message.match(/^WIP on [^:]+: [0-9a-f]+ (.*)$/)
  if (wip) return wip[1]
  const named = message.match(/^On [^:]+: (.*)$/)
  return named ? named[1] : message
}

type BranchMenu = (e: React.MouseEvent, branch: BranchInfo) => void

/** What every branch row needs, passed down the tree as one bundle. */
interface RowHandlers {
  onSelect: (branch: BranchInfo) => void
  onCheckout: (branch: BranchInfo) => void
  onContextMenu: BranchMenu
  favourites: ReadonlySet<string>
  onToggleFavourite: (name: string) => void
  settings: BranchListSettings
  listedAt: number
}

function pluralCommits(n: number): string {
  return `${n} commit${n === 1 ? '' : 's'}`
}

/** Deleted-on-remote, stale and ahead/behind tags for one branch. */
function BranchTags({ branch, settings, listedAt }: { branch: BranchInfo; settings: BranchListSettings; listedAt: number }): JSX.Element {
  const stale = staleAge(branch, listedAt, settings)
  const ahead = branch.ahead ?? 0
  const behind = branch.behind ?? 0
  const sync = [
    ahead > 0 && `${pluralCommits(ahead)} to push`,
    behind > 0 && `${pluralCommits(behind)} to pull`
  ].filter(Boolean)
  return (
    <span className="branch-tags">
      {(ahead > 0 || behind > 0) && (
        <span
          className="branch-sync"
          data-testid="branch-sync"
          title={`${sync.join(', ')} (${branch.upstream}, as of the last fetch)`}
        >
          {ahead > 0 && <span className="branch-ahead">↑{ahead}</span>}
          {behind > 0 && <span className="branch-behind">↓{behind}</span>}
        </span>
      )}
      {branch.upstreamGone && (
        <span
          className="branch-tag branch-tag-gone"
          data-testid="branch-tag-deleted"
          title={`${branch.upstream} was deleted on the remote. The local branch is still here.`}
        >
          gone
        </span>
      )}
      {stale && (
        <span
          className="branch-tag branch-tag-stale"
          data-testid="branch-tag-stale"
          title={`No commits for ${stale} (stale after ${settings.staleDays} days, change it in Settings)`}
        >
          {stale}
        </span>
      )}
    </span>
  )
}

function BranchRow({
  branch,
  label,
  depth,
  handlers
}: {
  branch: BranchInfo
  /** What the row shows: the last path segment in the tree, the full name among favourites. */
  label: string
  depth: number
  handlers: RowHandlers
}): JSX.Element {
  const drag = useRefDrag()
  const starred = handlers.favourites.has(branch.name)
  return (
    <div
      className={`tree-row branch-row ${branch.current ? 'current' : ''}`}
      data-branch={branch.name}
      style={{ paddingLeft: 8 + depth * 14 }}
      title={branch.current ? branch.name : `${branch.name} (double-click to check out)`}
      onClick={(e) => e.detail === 1 && handlers.onSelect(branch)}
      onDoubleClick={() => !branch.current && handlers.onCheckout(branch)}
      onContextMenu={(e) => handlers.onContextMenu(e, branch)}
      {...dropTarget(branch.remote ? null : branch.name)}
      onPointerDown={(e) => drag.begin(e, { kind: 'branch', name: branch.name, remote: branch.remote })}
    >
      {branch.current ? <span className="current-dot">●</span> : <span className="tree-caret-spacer" />}
      <span className="branch-name">{label}</span>
      <BranchTags branch={branch} settings={handlers.settings} listedAt={handlers.listedAt} />
      <button
        className={`branch-star ${starred ? 'starred' : ''}`}
        aria-label={starred ? `Remove ${branch.name} from favourites` : `Add ${branch.name} to favourites`}
        aria-pressed={starred}
        title={starred ? 'Remove from favourites' : 'Add to favourites (pins it to the top)'}
        // Keep a press on the star from starting a drag or selecting the branch.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          handlers.onToggleFavourite(branch.name)
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {starred ? '★' : '☆'}
      </button>
    </div>
  )
}

function TreeView({
  node,
  depth,
  collapsed,
  onToggle,
  handlers
}: {
  node: TreeNode
  depth: number
  collapsed: Set<string>
  onToggle: (path: string) => void
  handlers: RowHandlers
}): JSX.Element {
  const entries = Array.from(node.children.values()).sort((a, b) => {
    const aFolder = a.children.size > 0 && !a.fullName
    const bFolder = b.children.size > 0 && !b.fullName
    if (aFolder !== bFolder) return aFolder ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      {entries.map((child) => {
        const isFolder = child.children.size > 0
        if (isFolder) {
          const isCollapsed = collapsed.has(child.path)
          return (
            <div key={child.path}>
              <div
                className="tree-row folder-row"
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => onToggle(child.path)}
              >
                <span className="tree-caret">{isCollapsed ? '▸' : '▾'}</span>
                <span className="folder-icon">📁</span>
                <span>{child.name}</span>
              </div>
              {!isCollapsed && (
                <TreeView node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} handlers={handlers} />
              )}
            </div>
          )
        }
        if (!child.info) return null
        return <BranchRow key={child.path} branch={child.info} label={child.name} depth={depth} handlers={handlers} />
      })}
    </>
  )
}

export default function Sidebar({
  branches,
  headHash,
  onCheckout,
  onCreateBranch,
  onSelectCommit,
  actions,
  stashes,
  stashActions,
  favourites,
  onToggleFavourite,
  branchListSettings,
  listedAt,
  cleanupSnoozed,
  onOpenCleanup,
  onSnoozeCleanup
}: Props): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; hash: string; target: RefTarget } | null>(null)
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number; stash: StashEntry } | null>(null)
  const [localMenu, setLocalMenu] = useState<{ x: number; y: number } | null>(null)
  const [filter, setFilter] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['remote-root']))

  const filtered = useMemo(
    () => branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase())),
    [branches, filter]
  )
  // Starred branches move up into their own group rather than showing twice.
  const favouriteSet = useMemo(() => new Set(favourites), [favourites])
  const starred = useMemo(() => favouriteBranches(filtered, favourites), [filtered, favourites])
  const localTree = useMemo(
    () => buildTree(filtered.filter((b) => !b.remote && !favouriteSet.has(b.name))),
    [filtered, favouriteSet]
  )
  const remoteTree = useMemo(
    () => buildTree(filtered.filter((b) => b.remote && !favouriteSet.has(b.name))),
    [filtered, favouriteSet]
  )

  const tidy = cleanupSnoozed ? 0 : tidyCount(branches, favouriteSet, listedAt, branchListSettings)

  const toggle = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const currentBranch = branches.find((b) => b.current)?.name ?? null

  // A remote branch checks out the local branch that tracks it, or else a new
  // tracking branch, rather than a detached HEAD.
  const checkoutBranch = (branch: BranchInfo): void => {
    if (!branch.remote) {
      onCheckout(branch.name)
      return
    }
    const tracking = branches.find((b) => !b.remote && b.upstream === branch.name)
    if (tracking) {
      if (!tracking.current) onCheckout(tracking.name)
    } else actions.checkoutRemote(branch.name)
  }

  const selectBranch = (branch: BranchInfo): void => {
    if (branch.hash) onSelectCommit(branch.hash)
  }

  const stashMenuSections = (stash: StashEntry): ContextMenuItem[][] => [
    [
      { id: 'apply', label: 'Apply stash', onSelect: () => stashActions.apply(stash) },
      { id: 'pop', label: 'Pop stash', onSelect: () => stashActions.pop(stash) }
    ],
    [{ id: 'drop', label: 'Delete stash', danger: true, onSelect: () => stashActions.drop(stash) }]
  ]

  const openMenu: BranchMenu = (e, branch) => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      hash: branch.hash ?? branch.name,
      target: { name: branch.name, remote: branch.remote, current: branch.current }
    })
  }

  const handlers: RowHandlers = {
    onSelect: selectBranch,
    onCheckout: checkoutBranch,
    onContextMenu: openMenu,
    favourites: favouriteSet,
    onToggleFavourite,
    settings: branchListSettings,
    listedAt
  }

  const submitNewBranch = (): void => {
    const name = newBranch.trim()
    if (!name) return
    onCreateBranch(name)
    setNewBranch('')
    setShowNewBranch(false)
  }

  return (
    <nav className="sidebar" aria-label="Branches">
      <div className="sidebar-filter-row">
        <input
          className="filter-input"
          placeholder="Filter branches"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="icon-button" title="New branch" onClick={() => setShowNewBranch((v) => !v)}>
          +
        </button>
      </div>
      {showNewBranch && (
        <div className="new-branch-row">
          <input
            autoFocus
            placeholder="branch name"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNewBranch()}
          />
          <button onClick={submitNewBranch}>Create</button>
        </div>
      )}
      <div className="sidebar-scroll" data-drag-scroll="">
        {starred.length > 0 && (
          <>
            <div
              className="tree-group-header"
              aria-expanded={!collapsed.has('favourite-root')}
              {...pressable(() => toggle('favourite-root'))}
            >
              <span className="tree-caret" aria-hidden="true">{collapsed.has('favourite-root') ? '▸' : '▾'}</span>
              FAVOURITES
            </div>
            {!collapsed.has('favourite-root') && (
              <div role="group" aria-label="Favourite branches">
                {starred.map((b) => (
                  <BranchRow key={b.name} branch={b} label={b.name} depth={0} handlers={handlers} />
                ))}
              </div>
            )}
          </>
        )}

        <div
          className="tree-group-header"
          aria-expanded={!collapsed.has('local-root')}
          title="Right-click to clean up branches"
          onContextMenu={(e) => {
            e.preventDefault()
            setLocalMenu({ x: e.clientX, y: e.clientY })
          }}
          {...pressable(() => toggle('local-root'))}
        >
          <span className="tree-caret" aria-hidden="true">{collapsed.has('local-root') ? '▸' : '▾'}</span>
          LOCAL
        </div>
        {tidy > 0 && !collapsed.has('local-root') && (
          <div className="tidy-banner" role="status" data-testid="tidy-banner">
            <span className="tidy-banner-text">
              {formatCount(tidy)} branch{tidy === 1 ? '' : 'es'} to tidy
            </span>
            <button className="tidy-banner-review" onClick={onOpenCleanup}>
              Review
            </button>
            <button
              className="icon-button tidy-banner-dismiss"
              aria-label={`Hide for ${CLEANUP_SNOOZE_DAYS} days`}
              title={`Don't remind me for ${CLEANUP_SNOOZE_DAYS} days`}
              onClick={onSnoozeCleanup}
            >
              ✕
            </button>
          </div>
        )}
        {!collapsed.has('local-root') && (
          <TreeView node={localTree} depth={0} collapsed={collapsed} onToggle={toggle} handlers={handlers} />
        )}

        <div className="tree-group-header" aria-expanded={!collapsed.has('remote-root')} {...pressable(() => toggle('remote-root'))}>
          <span className="tree-caret" aria-hidden="true">{collapsed.has('remote-root') ? '▸' : '▾'}</span>
          REMOTE
        </div>
        {!collapsed.has('remote-root') && (
          <TreeView node={remoteTree} depth={0} collapsed={collapsed} onToggle={toggle} handlers={handlers} />
        )}

        <div className="tree-group-header" aria-expanded={!collapsed.has('stash-root')} {...pressable(() => toggle('stash-root'))}>
          <span className="tree-caret" aria-hidden="true">{collapsed.has('stash-root') ? '▸' : '▾'}</span>
          STASHES
          {stashes.length > 0 && <span className="tree-group-count">{stashes.length}</span>}
        </div>
        {!collapsed.has('stash-root') && (
          <ul className="stash-list" aria-label="Stashes">
            {stashes.length === 0 && <li className="stash-empty">No stashes</li>}
            {stashes.map((stash) => (
              <li
                key={stash.ref}
                className="tree-row stash-row"
                title={`${stash.ref}: ${stash.message}\nDouble-click to apply, right-click for more`}
                onDoubleClick={() => stashActions.apply(stash)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setStashMenu({ x: e.clientX, y: e.clientY, stash })
                }}
              >
                <span className="stash-title">{stashTitle(stash.message)}</span>
                <span className="stash-actions">
                  <button className="link-button" onClick={() => stashActions.apply(stash)}>
                    Apply
                  </button>
                  <button className="link-button" onClick={() => stashActions.pop(stash)}>
                    Pop
                  </button>
                  <button className="link-button danger" onClick={() => stashActions.drop(stash)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {localMenu && (
        <ContextMenu
          x={localMenu.x}
          y={localMenu.y}
          sections={[[{ id: 'cleanup', label: 'Clean up branches…', onSelect: onOpenCleanup }]]}
          onClose={() => setLocalMenu(null)}
        />
      )}
      {stashMenu && (
        <ContextMenu
          x={stashMenu.x}
          y={stashMenu.y}
          sections={stashMenuSections(stashMenu.stash)}
          onClose={() => setStashMenu(null)}
        />
      )}
      {menu && (
        <RefContextMenu
          x={menu.x}
          y={menu.y}
          hash={menu.hash}
          target={menu.target}
          currentBranch={currentBranch}
          headHash={headHash}
          actions={actions}
          onClose={() => setMenu(null)}
        />
      )}
    </nav>
  )
}
