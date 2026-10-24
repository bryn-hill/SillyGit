import { useMemo, useState } from 'react'
import type { BranchInfo } from '../../../shared/types'

interface TreeNode {
  name: string
  path: string
  fullName?: string
  current?: boolean
  remote?: boolean
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
      }
    }
  }
  return root
}

interface Props {
  branches: BranchInfo[]
  onCheckout: (branch: string) => void
  onCreateBranch: (branch: string) => void
}

function TreeView({
  node,
  depth,
  collapsed,
  onToggle,
  onCheckout
}: {
  node: TreeNode
  depth: number
  collapsed: Set<string>
  onToggle: (path: string) => void
  onCheckout: (branch: string) => void
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
                  onCheckout={onCheckout}
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
            onClick={() => !child.current && child.fullName && onCheckout(child.fullName)}
          >
            {child.current ? <span className="current-dot">●</span> : <span className="tree-caret-spacer" />}
            <span>{child.name}</span>
          </div>
        )
      })}
    </>
  )
}

export default function Sidebar({ branches, onCheckout, onCreateBranch }: Props): JSX.Element {
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

  const submitNewBranch = (): void => {
    const name = newBranch.trim()
    if (!name) return
    onCreateBranch(name)
    setNewBranch('')
    setShowNewBranch(false)
  }

  return (
    <div className="sidebar">
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
          <TreeView node={localTree} depth={0} collapsed={collapsed} onToggle={toggle} onCheckout={onCheckout} />
        )}

        <div className="tree-group-header" onClick={() => toggle('remote-root')}>
          <span className="tree-caret">{collapsed.has('remote-root') ? '▸' : '▾'}</span>
          REMOTE
        </div>
        {!collapsed.has('remote-root') && (
          <TreeView node={remoteTree} depth={0} collapsed={collapsed} onToggle={toggle} onCheckout={onCheckout} />
        )}
      </div>
    </div>
  )
}
