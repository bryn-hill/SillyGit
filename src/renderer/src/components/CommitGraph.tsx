import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { GraphRow } from '../lib/graphLayout'
import GraphCell, { ROW_HEIGHT, WipGraphCell } from './GraphCell'
import type { Selection } from '../App'
import type { BranchInfo, CommitSearchHit } from '../../../shared/types'
import RefContextMenu, { type RefActions, type RefTarget } from './RefContextMenu'
import { selectedHashes } from '../lib/selection'

interface RefBadge {
  label: string
  kind: 'head' | 'local' | 'remote' | 'tag'
}

/**
 * Turns `git log --decorate` refs into badges. Branch names can contain "/",
 * so local and remote branches are told apart with the real branch list.
 */
function parseRefs(refs: string[], localBranches: Set<string>, remoteBranches: Set<string>): RefBadge[] {
  const badges: RefBadge[] = []
  for (const raw of refs) {
    let label = raw.trim()
    let kind: RefBadge['kind'] = 'local'
    if (label.startsWith('HEAD -> ')) {
      label = label.slice('HEAD -> '.length)
      kind = 'head'
    } else if (label.startsWith('tag: ')) {
      label = label.slice('tag: '.length)
      kind = 'tag'
    } else if (localBranches.has(label)) {
      kind = 'local'
    } else if (remoteBranches.has(label) || label.includes('/')) {
      kind = 'remote'
    }
    // HEAD on its own (detached) and symbolic remote refs like origin/HEAD.
    if (label === 'HEAD' || label.endsWith('/HEAD')) continue
    badges.push({ label, kind })
  }
  return badges
}

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

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
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
  searchFocusToken
}: Props): JSX.Element {
  const topLane = rows[0]?.lane ?? 0
  const topColor = rows[0]?.color ?? '#bd93f9'
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

  const selected = useMemo(() => selectedHashes(selection), [selection])

  // --- Search -------------------------------------------------------------
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CommitSearchHit[] | null>(null)
  const [hitIndex, setHitIndex] = useState(0)
  const hitSet = useMemo(() => (hits ? new Set(hits.map((h) => h.hash)) : null), [hits])

  useEffect(() => {
    if (searchFocusToken === 0) return
    searchRef.current?.focus()
    searchRef.current?.select()
  }, [searchFocusToken])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      window.api.searchCommits(repoPath, q).then((res) => {
        if (cancelled) return
        const found = res.ok ? res.data : []
        setHits(found)
        setHitIndex(0)
        if (found.length > 0) onJumpToCommit(found[0])
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // onJumpToCommit changes every render; only a new query should search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, repoPath])

  const stepHit = (delta: number): void => {
    if (!hits || hits.length === 0) return
    const next = (hitIndex + delta + hits.length) % hits.length
    setHitIndex(next)
    onJumpToCommit(hits[next])
  }

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

  const renderRow = (row: GraphRow): JSX.Element => {
    const badges = parseRefs(row.commit.refs, localBranches, remoteBranches)
    const isSelected = selected.has(row.commit.hash)
    const isContextTarget = menu?.hash === row.commit.hash
    const dimmed = hitSet !== null && !hitSet.has(row.commit.hash)
    return (
      <div
        key={row.commit.hash}
        className={`graph-row ${isSelected ? 'selected' : ''} ${isContextTarget ? 'context-target' : ''} ${dimmed ? 'dimmed' : ''}`}
        role="option"
        aria-selected={isSelected}
        data-hash={row.commit.hash}
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
        <GraphCell row={row} />
        <div className="graph-row-message">
          {badges.map((b) => (
            <span
              key={b.label}
              className={`ref-badge ref-${b.kind}`}
              title={b.kind === 'tag' || b.kind === 'head' ? b.label : `${b.label} (double-click to check out)`}
              onClick={(e) => {
                // A label selects its commit but never clears it, so double-clicking
                // the label of the selected commit doesn't close the side bar.
                if (isSelected && selection.type === 'commit') e.stopPropagation()
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                checkoutBadge(b)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setMenu({ x: e.clientX, y: e.clientY, hash: row.commit.hash, target: badgeTarget(b) })
              }}
            >
              {b.label}
            </span>
          ))}
          <span className="graph-row-subject" style={{ color: row.color }}>
            {row.commit.subject}
          </span>
          <span className="graph-row-meta">
            {row.commit.author} · {timeAgo(row.commit.date)}
          </span>
        </div>
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
      visible.push(renderRow(rows[i - wipOffset]))
    }
  }

  return (
    <div className="commit-graph">
      <div className="commit-graph-header">
        <span className="col-graph">Graph</span>
        <span className="col-message">Commit message</span>
        <div className="graph-search">
          <input
            ref={searchRef}
            type="search"
            aria-label="Search commits"
            placeholder="Search commits"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                stepHit(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          {hits && (
            <span className="graph-search-count" aria-live="polite">
              {hits.length === 0 ? 'No matches' : `${hitIndex + 1} of ${hits.length}`}
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
        </div>
      </div>
      <div
        className="commit-graph-body"
        ref={bodyRef}
        role="listbox"
        aria-label="Commits"
        aria-multiselectable="true"
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
