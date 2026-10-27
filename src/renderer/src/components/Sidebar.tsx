import { useMemo, useState, type JSX } from 'react'
import type { BranchInfo, StashEntry } from '../../../shared/types'
import RefContextMenu, { type RefActions, type RefTarget } from './RefContextMenu'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

interface TreeNode {
  name: string
  path: string
  fullName?: string
  current?: boolean
  remote?: boolean
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
        node.current = b.current
        node.remote = b.remote
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
}

/** "WIP on main: 1a2b3c4 Subject" -> "Subject"; "On main: my note" -> "my note". */
function stashTitle(message: string): string {
  const wip = message.match(/^WIP on [^:]+: [0-9a-f]+ (.*)$/)
  if (wip) return wip[1]
  const named = message.match(/^On [^:]+: (.*)$/)
  return named ? named[1] : message
}

type BranchMenu = (e: React.MouseEvent, branch: BranchInfo) => void

function TreeView({
  node,
  depth,
  collapsed,
  onToggle,
  onSelect,
  onCheckout,
  onContextMenu
}: {
  node: TreeNode
  depth: number
  collapsed: Set<string>
  onToggle: (path: string) => void
  onSelect: (branch: BranchInfo) => void
  onCheckout: (branch: BranchInfo) => void
  onContextMenu: BranchMenu
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
                <TreeView
                  node={child}
                  depth={depth + 1}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onCheckout={onCheckout}
                  onContextMenu={onContextMenu}
                />
              )}
            </div>
          )
        }
        return (
          <div
            key={child.path}
            className={`tree-row branch-row ${child.current ? 'current' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={child.current ? child.fullName : `${child.fullName} (double-click to check out)`}
            onClick={(e) => e.detail === 1 && child.info && onSelect(child.info)}
            onDoubleClick={() => !child.current && child.info && onCheckout(child.info)}
            onContextMenu={(e) => child.info && onContextMenu(e, child.info)}
          >
            {child.current ? <span className="current-dot">●</span> : <span className="tree-caret-spacer" />}
            <span>{child.name}</span>
          </div>
        )
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
  stashActions
}: Props): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; hash: string; target: RefTarget } | null>(null)
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number; stash: StashEntry } | null>(null)
  const [filter, setFilter] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['remote-root']))

  const filtered = useMemo(
    () => branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase())),
    [branches, filter]
  )
  const localTree = useMemo(() => buildTree(filtered.filter((b) => !b.remote)), [filtered])
  const remoteTree = useMemo(() => buildTree(filtered.filter((b) => b.remote)), [filtered])

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
      <div className="sidebar-scroll">
        <div className="tree-group-header" onClick={() => toggle('local-root')}>
          <span className="tree-caret">{collapsed.has('local-root') ? '▸' : '▾'}</span>
          LOCAL
        </div>
        {!collapsed.has('local-root') && (
          <TreeView node={localTree} depth={0} collapsed={collapsed} onToggle={toggle} onSelect={selectBranch} onCheckout={checkoutBranch} onContextMenu={openMenu} />
        )}

        <div className="tree-group-header" onClick={() => toggle('remote-root')}>
          <span className="tree-caret">{collapsed.has('remote-root') ? '▸' : '▾'}</span>
          REMOTE
        </div>
        {!collapsed.has('remote-root') && (
          <TreeView node={remoteTree} depth={0} collapsed={collapsed} onToggle={toggle} onSelect={selectBranch} onCheckout={checkoutBranch} onContextMenu={openMenu} />
        )}

        <div className="tree-group-header" onClick={() => toggle('stash-root')}>
          <span className="tree-caret">{collapsed.has('stash-root') ? '▸' : '▾'}</span>
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
