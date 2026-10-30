import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { GraphRow } from '../lib/graphLayout'
import GraphCell, { ROW_HEIGHT, WipGraphCell } from './GraphCell'
import type { Selection } from '../lib/selection'
import type { BranchInfo, CommitSearchHit } from '../../../shared/types'
import RefContextMenu, { type RefActions, type RefTarget } from './RefContextMenu'
import { selectedHashes } from '../lib/selection'
import { groupRefs, parseRefs, type RefBadge } from '../lib/refs'
import RefCell, { type RefHandlers } from './RefCell'
import { dropTarget, useRefDrag } from './RefDrag'
import { commitsLabel } from '../lib/refDrag'
import { localDay, sprintIndexOfDay, sprintLabel, sprintMarks, type SprintSettings } from '../../../shared/sprints'
import { timeAgo } from '../lib/time'
import { useMergeBurst } from './commitGraph/useMergeBurst'
import { useGraphSearch } from './commitGraph/useGraphSearch'
import { useBisectState } from '../lib/bisectMenu'
import { bisectMarks, markLabel } from '../../../shared/bisect'
import Select from './Select'
import {
  graphFilterLabel,
  SEARCH_MODES,
  SEARCH_SYNTAX_HINT,
  type CommitSearchMode,
  type GraphFilter
} from '../../../shared/historySearch'

const MODE_OPTIONS = SEARCH_MODES.map((m) => ({ value: m.mode, label: m.label }))

export const DEFAULT_REF_COLUMN_WIDTH = 170
const MIN_REF_COLUMN_WIDTH = 60
const MAX_REF_COLUMN_WIDTH = 480

function badgeTarget(badge: RefBadge): RefTarget | null {
  if (badge.kind === 'tag') return null
  return { name: badge.label, remote: badge.kind === 'remote', current: badge.kind === 'head' }
}

/** The branch a right-click on a whole row acts on: prefer one that isn't checked out, local before remote. */
function rowTarget(badges: RefBadge[]): RefTarget | null {
  const pick =
    badges.find((b) => b.kind === 'local') ??
    badges.find((b) => b.kind === 'remote') ??
    badges.find((b) => b.kind === 'head')
  return pick ? badgeTarget(pick) : null
}

// Rows drawn above and below the visible ones, so fast scrolling doesn't flash blanks.
const OVERSCAN = 15
// Start loading the next page this many rows before the end.
const LOAD_MORE_THRESHOLD = 40

export interface ClickModifiers {
  /** Cmd-click on macOS, Ctrl-click elsewhere: add or remove this commit. */
  toggle: boolean
  /** Shift-click: select everything from the last clicked commit to this one. */
  range: boolean
}

interface Props {
  repoPath: string
  rows: GraphRow[]
  selection: Selection
  hasWorkingChanges: boolean
  headHash: string | null
  currentBranch: string | null
  branches: BranchInfo[]
  onSelectWorking: () => void
  onClickCommit: (hash: string, modifiers: ClickModifiers) => void
  /** Selects a commit found by search, loading more history first if it's beyond what's loaded. */
  onJumpToCommit: (hit: CommitSearchHit) => void
  onCheckout: (branch: string) => void
  /** Replaces "Uncommitted changes" on the WIP row, e.g. to report conflicts. */
  wipConflictLabel?: string | null
  actions: RefActions
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  /** Bumped to move the keyboard focus into the search box. */
  searchFocusToken: number
  refColumnWidth: number
  onRefColumnWidthChange: (width: number) => void
  /** Sprint dividers and shading, when turned on in Settings. */
  sprints: SprintSettings
  /** Animate a merge landing on the checked-out branch (Settings). */
  mergeAnimation: boolean
  /** The path filter `rows` were read with, shown as a chip that clears it. */
  filter: GraphFilter | null
  onFilterChange: (filter: GraphFilter | null) => void
}

export default function CommitGraph({
  repoPath,
  rows,
  selection,
  hasWorkingChanges,
  headHash,
  currentBranch,
  branches,
  onSelectWorking,
  onClickCommit,
  onJumpToCommit,
  onCheckout,
  wipConflictLabel,
  actions,
  hasMore,
  loadingMore,
  onLoadMore,
  searchFocusToken,
  refColumnWidth,
  onRefColumnWidthChange,
  sprints,
  mergeAnimation,
  filter,
  onFilterChange
}: Props): JSX.Element {
  // The WIP node sits above the checked-out commit's lane and a dashed line
  // joins them, even when other branch tips come between.
  const headIndex = headHash ? rows.findIndex((r) => r.commit.hash === headHash) : -1
  const wipRow = headIndex === -1 ? rows[0] : rows[headIndex]
  const topLane = wipRow?.lane ?? 0
  const topColor = wipRow?.color ?? '#bd93f9'
  const [menu, setMenu] = useState<{ x: number; y: number; hash: string; target: RefTarget | null } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewHeight, setViewHeight] = useState(600)

  const [localBranches, remoteBranches] = useMemo(
    () => [
      new Set(branches.filter((b) => !b.remote).map((b) => b.name)),
      new Set(branches.filter((b) => b.remote).map((b) => b.name))
    ],
    [branches]
  )

  const upstreams = useMemo(
    () => new Map(branches.filter((b) => !b.remote && b.upstream).map((b) => [b.name, b.upstream as string])),
    [branches]
  )

  const selected = useMemo(() => selectedHashes(selection), [selection])
  const drag = useRefDrag()

  /** Dragging a row cherry-picks its commit, or the whole selection when the row is part of it. */
  const dragCommits = (hash: string): string[] =>
    selection.type === 'commits' && selection.hashes.includes(hash) ? selection.hashes : [hash]

  const marks = useMemo(
    () => (sprints.enabled ? sprintMarks(rows.map((r) => r.commit.committedAt || r.commit.date), sprints) : null),
    [rows, sprints]
  )
  const burst = useMergeBurst(rows, mergeAnimation)
  const bisect = useBisectState()
  const bisectMarkOf = useMemo(() => bisectMarks(bisect), [bisect])

  const burstFor = (hash: string): { id: number; delay: number } | undefined => {
    const delay = burst?.delays.get(hash)
    return burst && delay !== undefined ? { id: burst.id, delay } : undefined
  }

  const now = new Date()
  const today = localDay(now.toISOString())
  const currentSprint = today === null ? null : sprintIndexOfDay(today, sprints)

  const { query, changeQuery, mode, changeMode, search, hits, error, searching, hitIndex, hitSet, stepHit } = useGraphSearch({
    repoPath,
    filter,
    searchRef,
    searchFocusToken,
    onJumpToCommit
  })

  const searchCount = error
    ? search.mode === 'regex'
      ? 'Invalid regex'
      : 'Search failed'
    : !hits || (searching && hits.length === 0)
      ? 'Searching…'
      : hits.length === 0
        ? 'No matches'
        : `${hitIndex + 1} of ${hits.length}`

  // --- Virtual scrolling ----------------------------------------------------
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(() => setViewHeight(body.clientHeight))
    observer.observe(body)
    setViewHeight(body.clientHeight)
    return () => observer.disconnect()
  }, [])

  const wipOffset = hasWorkingChanges ? 1 : 0
  const totalRows = rows.length + wipOffset
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(totalRows, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + OVERSCAN)

  useEffect(() => {
    if (hasMore && !loadingMore && last >= totalRows - LOAD_MORE_THRESHOLD) onLoadMore()
  }, [hasMore, loadingMore, last, totalRows, onLoadMore])

  // Bring the selection into view when it moves by keyboard, search or the
  // side bar, including to a row that only appears once more history loads.
  // Refreshes alone never scroll.
  const pendingScroll = useRef<string | null>(null)
  useEffect(() => {
    pendingScroll.current =
      selection.type === 'commit' ? selection.hash : selection.type === 'working' ? 'working' : null
  }, [selection])
  useEffect(() => {
    const target = pendingScroll.current
    const body = bodyRef.current
    if (!target || !body) return
    const index = target === 'working' ? 0 : rows.findIndex((r) => r.commit.hash === target)
    if (index === -1) return
    pendingScroll.current = null
    const top = (index + (target === 'working' ? 0 : wipOffset)) * ROW_HEIGHT
    if (top < body.scrollTop) body.scrollTop = top
    else if (top + ROW_HEIGHT > body.scrollTop + body.clientHeight) {
      body.scrollTop = top + ROW_HEIGHT - body.clientHeight + ROW_HEIGHT * 2
    }
  }, [selection, rows, wipOffset])

  const checkoutBadge = (badge: RefBadge): void => {
    if (badge.kind === 'head' || badge.kind === 'tag') return
    if (badge.kind === 'local') {
      onCheckout(badge.label)
      return
    }
    // A remote branch: use the local branch that tracks it when there is one.
    const tracking = branches.find((b) => !b.remote && b.upstream === badge.label)
    if (tracking) {
      if (!tracking.current) onCheckout(tracking.name)
    } else actions.checkoutRemote(badge.label)
  }

  const refHandlers = (hash: string, isSelected: boolean): RefHandlers => ({
    onClick: (e) => {
      // A label selects its commit but never clears it, so double-clicking
      // the label of the selected commit doesn't close the side bar.
      if (isSelected && selection.type === 'commit') e.stopPropagation()
    },
    onDoubleClick: checkoutBadge,
    onContextMenu: (e, badge) => {
      e.preventDefault()
      e.stopPropagation()
      setMenu({ x: e.clientX, y: e.clientY, hash, target: badgeTarget(badge) })
    }
  })

  // --- Resizing the Branch / Tag column --------------------------------------
  const startResize = (e: ReactMouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = refColumnWidth
    const onMove = (ev: MouseEvent): void => {
      const next = startWidth + ev.clientX - startX
      onRefColumnWidthChange(Math.round(Math.min(MAX_REF_COLUMN_WIDTH, Math.max(MIN_REF_COLUMN_WIDTH, next))))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('col-resizing')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('col-resizing')
  }

  const wipLinkFor = (index: number): { kind: 'pass' | 'end'; lane: number; color: string } | undefined => {
    if (!hasWorkingChanges || headIndex === -1 || index > headIndex) return undefined
    return { kind: index === headIndex ? 'end' : 'pass', lane: topLane, color: topColor }
  }

  const renderRow = (row: GraphRow, index: number): JSX.Element => {
    const badges = parseRefs(row.commit.refs, localBranches, remoteBranches)
    const pills = groupRefs(badges, upstreams)
    const isSelected = selected.has(row.commit.hash)
    const isContextTarget = menu?.hash === row.commit.hash
    const dimmed = hitSet !== null && !hitSet.has(row.commit.hash)
    const mark = marks?.[index]
    const bisectMark = bisectMarkOf.get(row.commit.hash)
    const sprintClass = mark
      ? `sprint-band-${Math.abs(mark.sprint.index) % 2 ? 'odd' : 'even'} ${mark.starts ? 'sprint-start' : ''} ${
          mark.starts && index + wipOffset === 0 ? 'sprint-first' : ''
        }`
      : ''
    return (
      <div
        key={row.commit.hash}
        className={`graph-row ${isSelected ? 'selected' : ''} ${isContextTarget ? 'context-target' : ''} ${dimmed ? 'dimmed' : ''} ${sprintClass}`}
        role="option"
        aria-selected={isSelected}
        data-hash={row.commit.hash}
        data-search-match={hitSet?.has(row.commit.hash) || undefined}
        {...dropTarget(pills[0]?.local?.label)}
        onPointerDown={(e) => {
          const hashes = dragCommits(row.commit.hash)
          // Oldest first, the order they're picked in.
          drag.begin(e, { kind: 'commits', hashes: [...hashes].reverse(), label: commitsLabel(hashes) })
        }}
        onClick={(e) => {
          // The second click of a double-click would undo the first one's toggle.
          if (e.button !== 0 || e.detail > 1) return
          const isMac = navigator.platform.toLowerCase().includes('mac')
          onClickCommit(row.commit.hash, { toggle: isMac ? e.metaKey : e.ctrlKey, range: e.shiftKey })
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, hash: row.commit.hash, target: rowTarget(badges) })
        }}
      >
        <RefCell
          pills={pills}
          color={row.color}
          width={refColumnWidth}
          handlers={refHandlers(row.commit.hash, isSelected)}
          burst={burstFor(row.commit.hash)}
        />
        <GraphCell
          row={row}
          repoPath={repoPath}
          connector={badges.length > 0}
          wipLink={wipLinkFor(index)}
          burst={burstFor(row.commit.hash)}
        />
        <div className="graph-row-message">
          {bisectMark && bisect && (
            <span className={`bisect-mark bisect-mark-${bisectMark}`} data-testid="bisect-mark" data-mark={bisectMark}>
              {markLabel(bisectMark, bisect.terms)}
            </span>
          )}
          <span className="graph-row-subject" style={{ color: row.color }}>
            {row.commit.subject}
          </span>
          <span className="graph-row-meta">
            {row.commit.author} · {timeAgo(row.commit.date)}
          </span>
        </div>
        {mark?.starts && (
          <div
            className={`sprint-marker ${mark.sprint.index === currentSprint ? 'current' : ''}`}
            data-testid="sprint-marker"
          >
            {sprintLabel(mark.sprint, now.getFullYear())}
            {mark.sprint.index === currentSprint && <span className="sprint-marker-now"> · current</span>}
          </div>
        )}
      </div>
    )
  }

  const visible: JSX.Element[] = []
  for (let i = first; i < last; i++) {
    if (i < wipOffset) {
      visible.push(
        <div
          key="wip"
          className={`graph-row wip-row ${selection.type === 'working' ? 'selected' : ''}`}
          role="option"
          aria-selected={selection.type === 'working'}
          onClick={onSelectWorking}
        >
          <div className="ref-cell" style={{ width: refColumnWidth }} />
          <WipGraphCell lane={topLane} color={topColor} />
          <div className="graph-row-message">
            <span className="wip-label">// WIP</span>
            {wipConflictLabel ? (
              <span className="graph-row-subject wip-conflict">
                <span aria-hidden="true">⚠ </span>
                {wipConflictLabel}
              </span>
            ) : (
              <span className="graph-row-subject" style={{ color: topColor }}>
                Uncommitted changes
              </span>
            )}
          </div>
        </div>
      )
    } else {
      visible.push(renderRow(rows[i - wipOffset], i - wipOffset))
    }
  }

  return (
    <div className="commit-graph">
      <div className="commit-graph-header">
        <div className="col-refs" style={{ width: refColumnWidth }}>
          Branch / Tag
          <div
            className="col-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize branch and tag column"
            title="Drag to resize, double-click to reset"
            onMouseDown={startResize}
            onDoubleClick={() => onRefColumnWidthChange(DEFAULT_REF_COLUMN_WIDTH)}
          />
        </div>
        <span className="col-graph">Graph</span>
        <span className="col-message">Commit message</span>
        <div className="graph-search">
          <Select<CommitSearchMode>
            className="graph-search-mode"
            variant="ghost"
            aria-label="Search in"
            title="What to search; or type a prefix such as author: or -S"
            value={search.mode}
            options={MODE_OPTIONS}
            onChange={changeMode}
          />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search commits"
            placeholder={SEARCH_MODES.find((m) => m.mode === mode)?.placeholder}
            title={SEARCH_SYNTAX_HINT}
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                stepHit(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                changeQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          {(hits || searching) && (
            <span className="graph-search-count" aria-live="polite" title={error ?? undefined}>
              {searchCount}
            </span>
          )}
          {hits && hits.length > 1 && (
            <>
              <button className="graph-search-step" title="Previous match (Shift+Enter)" onClick={() => stepHit(-1)}>
                ↑
              </button>
              <button className="graph-search-step" title="Next match (Enter)" onClick={() => stepHit(1)}>
                ↓
              </button>
            </>
          )}
          {search.mode === 'path' && search.term && (
            <button
              className="graph-search-step"
              title="Show only the commits touching paths that contain this"
              onClick={() => {
                onFilterChange({ path: search.term, contains: true })
                changeQuery('')
              }}
            >
              Filter
            </button>
          )}
        </div>
      </div>
      {filter && (
        <div className="graph-filter-bar" role="status">
          <span className="graph-filter-chip" data-testid="graph-filter-chip">
            <span className="graph-filter-label">{graphFilterLabel(filter)}</span>
            <button
              className="graph-filter-clear"
              aria-label="Clear filter"
              title="Show every commit again"
              onClick={() => onFilterChange(null)}
            >
              ×
            </button>
          </span>
          {!loadingMore && (
            <span className="graph-filter-count">
              {rows.length === 0
                ? 'No commits touch this path'
                : `${rows.length}${hasMore ? '+' : ''} commit${rows.length === 1 && !hasMore ? '' : 's'}`}
            </span>
          )}
        </div>
      )}
      <div
        className="commit-graph-body"
        ref={bodyRef}
        role="listbox"
        aria-label="Commits"
        aria-multiselectable="true"
        data-drag-scroll=""
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: first * ROW_HEIGHT }} aria-hidden="true" />
        {visible}
        <div style={{ height: (totalRows - last) * ROW_HEIGHT }} aria-hidden="true" />
        {loadingMore && <div className="graph-loading-more">Loading more commits…</div>}
      </div>
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
    </div>
  )
}
