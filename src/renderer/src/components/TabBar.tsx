import { useState, type DragEvent, type JSX } from 'react'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import { BranchIcon, FolderIcon, LaunchpadIcon } from './TopBar'
import { repoDisplayName } from '../lib/repoName'
import { MOD } from '../lib/shortcuts'

interface Props {
  /** Open repos in tab order, pinned ones first. */
  tabs: string[]
  pinned: string[]
  activeTab: string | null
  launchpadActive: boolean
  onSelect: (path: string) => void
  onClose: (paths: string[]) => void
  onNewTab: () => void
  onOpenLaunchpad: () => void
  onTogglePin: (path: string) => void
  /** Moves `path` to just before `before`, or to the end of its group when `before` is null. */
  onMove: (path: string, before: string | null) => void
  onCopyPath: (path: string) => void
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PinIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 1.8h4M7 1.8v4.4L4.2 9.4h7.6L9 6.2V1.8M8 9.4v4.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Tab labels: the folder name, plus its parent when two open repos share a name. */
function tabLabels(tabs: string[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const path of tabs) counts.set(repoDisplayName(path), (counts.get(repoDisplayName(path)) ?? 0) + 1)
  return new Map(
    tabs.map((path) => {
      const name = repoDisplayName(path)
      if ((counts.get(name) ?? 0) < 2) return [path, name]
      const parent = repoDisplayName(path.slice(0, path.length - name.length).replace(/[\\/]+$/, ''))
      return [path, `${name} · ${parent}`]
    })
  )
}

const DRAG_TYPE = 'application/x-sillygit-tab'

/**
 * GitKraken-style window title strip: open a repo, the Launchpad tab, one tab
 * per open repo (pinned ones grouped on the left) and + for a new tab. The
 * strip's empty space drags the window on macOS; tabs take clicks.
 */
export default function TabBar({
  tabs,
  pinned,
  activeTab,
  launchpadActive,
  onSelect,
  onClose,
  onNewTab,
  onOpenLaunchpad,
  onTogglePin,
  onMove,
  onCopyPath
}: Props): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined)
  const labels = tabLabels(tabs)
  const pinnedTabs = tabs.filter((p) => pinned.includes(p))
  const otherTabs = tabs.filter((p) => !pinned.includes(p))
  const sameGroup = (a: string, b: string): boolean => pinned.includes(a) === pinned.includes(b)

  const endDrag = (): void => {
    setDragging(null)
    setDropBefore(undefined)
  }

  const handleDragOver = (e: DragEvent, path: string): void => {
    if (!dragging || !sameGroup(dragging, path)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientX > rect.left + rect.width / 2
    if (!after) {
      setDropBefore(path)
      return
    }
    const group = pinned.includes(path) ? pinnedTabs : otherTabs
    setDropBefore(group[group.indexOf(path) + 1] ?? null)
  }

  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    if (dragging && dropBefore !== undefined && dropBefore !== dragging) onMove(dragging, dropBefore)
    endDrag()
  }

  const renderTab = (path: string): JSX.Element => {
    const isPinned = pinned.includes(path)
    const active = path === activeTab && !launchpadActive
    const group = isPinned ? pinnedTabs : otherTabs
    const isLast = group[group.length - 1] === path
    const dropClass =
      dragging && dragging !== path
        ? dropBefore === path
          ? 'drop-before'
          : dropBefore === null && isLast && sameGroup(dragging, path)
            ? 'drop-after'
            : ''
        : ''
    return (
      <div
        key={path}
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        className={`repo-tab ${active ? 'repo-tab-active' : ''} ${isPinned ? 'repo-tab-pinned' : ''} ${
          dragging === path ? 'repo-tab-dragging' : ''
        } ${dropClass}`}
        title={path}
        draggable
        onClick={() => onSelect(path)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(path)
          }
        }}
        onMouseDown={(e) => {
          // Keep middle-click from starting autoscroll.
          if (e.button === 1) e.preventDefault()
        }}
        onAuxClick={(e) => {
          if (e.button === 1) onClose([path])
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, path })
        }}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, path)
          e.dataTransfer.effectAllowed = 'move'
          setDragging(path)
        }}
        onDragOver={(e) => handleDragOver(e, path)}
        onDrop={handleDrop}
        onDragEnd={endDrag}
      >
        <span className="repo-tab-icon">{isPinned ? <PinIcon /> : <BranchIcon />}</span>
        <span className="repo-tab-name">{labels.get(path)}</span>
        {!isPinned && (
          <button
            className="repo-tab-close"
            aria-label={`Close ${labels.get(path)}`}
            title={`Close tab`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onClose([path])
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
    )
  }

  const menuSections = (path: string): ContextMenuItem[][] => {
    const others = tabs.filter((p) => p !== path)
    const index = tabs.indexOf(path)
    const right = tabs.slice(index + 1).filter((p) => !pinned.includes(p))
    return [
      [{ id: 'pin', label: pinned.includes(path) ? 'Unpin tab' : 'Pin tab', onSelect: () => onTogglePin(path) }],
      [
        { id: 'close', label: 'Close tab', onSelect: () => onClose([path]) },
        {
          id: 'close-others',
          label: 'Close other tabs',
          disabled: others.every((p) => pinned.includes(p)),
          title: 'Pinned tabs stay open',
          onSelect: () => onClose(others.filter((p) => !pinned.includes(p)))
        },
        {
          id: 'close-right',
          label: 'Close tabs to the right',
          disabled: right.length === 0,
          onSelect: () => onClose(right)
        }
      ],
      [{ id: 'copy-path', label: 'Copy repository path', onSelect: () => onCopyPath(path) }]
    ]
  }

  return (
    <div className="tab-bar">
      <button
        className="tab-bar-button"
        onClick={onNewTab}
        title={`Open a repository in a new tab (${MOD}O)`}
        aria-label="Open repository in a new tab"
      >
        <FolderIcon />
      </button>
      <div className="tab-strip" role="tablist" aria-label="Open repositories">
        <div
          role="tab"
          aria-selected={launchpadActive}
          tabIndex={launchpadActive ? 0 : -1}
          className={`repo-tab launchpad-tab ${launchpadActive ? 'repo-tab-active' : ''}`}
          title="Launchpad — your open pull requests"
          onClick={onOpenLaunchpad}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onOpenLaunchpad()
            }
          }}
        >
          <span className="repo-tab-icon">
            <LaunchpadIcon />
          </span>
          <span className="repo-tab-name">Launchpad</span>
        </div>
        {pinnedTabs.length > 0 && (
          <div className="tab-group" role="group" aria-label="Pinned tabs">
            <span className="tab-group-grip" aria-hidden />
            {pinnedTabs.map(renderTab)}
          </div>
        )}
        {otherTabs.map(renderTab)}
        <button
          className="tab-bar-button tab-new"
          onClick={onNewTab}
          title={`New tab (${MOD}T)`}
          aria-label="New tab"
        >
          <PlusIcon />
        </button>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} sections={menuSections(menu.path)} onClose={() => setMenu(null)} />}
    </div>
  )
}
