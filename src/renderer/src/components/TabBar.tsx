import { useEffect, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
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

// How far the pointer moves before a press on a tab becomes a drag.
const DRAG_THRESHOLD = 5

/**
 * GitKraken-style window title strip: open a repo, the Launchpad tab, one tab
 * per open repo (pinned ones grouped on the left) and + for a new tab. The
 * strip's empty space drags the window on macOS; tabs take clicks.
 *
 * Tabs are selected on pointer down, like browser tabs, and reordered with
 * pointer events rather than HTML drag and drop: a native drag starts on the
 * slightest wobble and eats the click, and inside a window drag region on
 * macOS it is unreliable anyway.
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

  // The press that may become a drag; `moved` once it passes the threshold.
  const press = useRef<{ path: string; x: number; y: number; pointerId: number; moved: boolean } | null>(null)
  const tabEls = useRef(new Map<string, HTMLDivElement>())

  const endDrag = (): void => {
    press.current = null
    setDragging(null)
    setDropBefore(undefined)
  }

  // Where a tab dragged to clientX would land among the tabs of its own group.
  const dropTargetAt = (path: string, clientX: number): string | null => {
    const group = (pinned.includes(path) ? pinnedTabs : otherTabs).filter((p) => p !== path)
    for (const other of group) {
      const rect = tabEls.current.get(other)?.getBoundingClientRect()
      if (rect && clientX < rect.left + rect.width / 2) return other
    }
    return null
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, path: string): void => {
    if (e.button !== 0) return
    // The close button handles its own click.
    if ((e.target as HTMLElement).closest('button')) return
    onSelect(path)
    press.current = { path, x: e.clientX, y: e.clientY, pointerId: e.pointerId, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const current = press.current
    if (!current || current.pointerId !== e.pointerId) return
    if (!current.moved) {
      if (Math.hypot(e.clientX - current.x, e.clientY - current.y) < DRAG_THRESHOLD) return
      current.moved = true
      setDragging(current.path)
    }
    setDropBefore(dropTargetAt(current.path, e.clientX))
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const current = press.current
    if (!current || current.pointerId !== e.pointerId) return
    if (current.moved) {
      const before = dropTargetAt(current.path, e.clientX)
      const group = pinned.includes(current.path) ? pinnedTabs : otherTabs
      const nextInGroup = group[group.indexOf(current.path) + 1] ?? null
      if (before !== nextInGroup) onMove(current.path, before)
    }
    endDrag()
  }

  // A drag that loses its pointer (window blur, Escape) just stops.
  useEffect(() => {
    if (!dragging) return
    const cancel = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') endDrag()
    }
    window.addEventListener('keydown', cancel)
    window.addEventListener('blur', endDrag)
    return () => {
      window.removeEventListener('keydown', cancel)
      window.removeEventListener('blur', endDrag)
    }
  }, [dragging])

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
        ref={(el) => {
          if (el) tabEls.current.set(path, el)
          else tabEls.current.delete(path)
        }}
        onPointerDown={(e) => handlePointerDown(e, path)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={endDrag}
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
      {/* In <body>, outside every window drag region: a menu inside the strip
          hangs over the toolbar's drag region below, which on macOS swallows
          its clicks. */}
      {menu &&
        createPortal(
          <ContextMenu x={menu.x} y={menu.y} sections={menuSections(menu.path)} onClose={() => setMenu(null)} />,
          document.body
        )}
    </div>
  )
}
