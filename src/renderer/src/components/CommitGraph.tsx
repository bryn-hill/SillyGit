import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { GraphRow } from '../lib/graphLayout'
import GraphCell, { WipGraphCell } from './GraphCell'
import type { Selection } from '../App'
import type { BranchInfo } from '../../../shared/types'
import RefContextMenu, { type RefActions, type RefTarget } from './RefContextMenu'

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

interface Props {
  rows: GraphRow[]
  selection: Selection
  hasWorkingChanges: boolean
  headHash: string | null
  currentBranch: string | null
  branches: BranchInfo[]
  onSelectWorking: () => void
  onSelectCommit: (hash: string) => void
  onCheckout: (branch: string) => void
  /** Replaces "Uncommitted changes" on the WIP row, e.g. to report conflicts. */
  wipConflictLabel?: string | null
  actions: RefActions
}

export default function CommitGraph({
  rows,
  selection,
  hasWorkingChanges,
  headHash,
  currentBranch,
  branches,
  onSelectWorking,
  onSelectCommit,
  onCheckout,
  wipConflictLabel,
  actions
}: Props): JSX.Element {
  const topLane = rows[0]?.lane ?? 0
  const topColor = rows[0]?.color ?? '#bd93f9'
  const [menu, setMenu] = useState<{ x: number; y: number; hash: string; target: RefTarget | null } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const [localBranches, remoteBranches] = useMemo(
    () => [
      new Set(branches.filter((b) => !b.remote).map((b) => b.name)),
      new Set(branches.filter((b) => b.remote).map((b) => b.name))
    ],
    [branches]
  )

  // Keep the selected row visible when the selection moves with the arrow keys.
  useEffect(() => {
    bodyRef.current?.querySelector('.graph-row.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selection])

  return (
    <div className="commit-graph">
      <div className="commit-graph-header">
        <span className="col-graph">Graph</span>
        <span className="col-message">Commit message</span>
      </div>
      <div className="commit-graph-body" ref={bodyRef} role="listbox" aria-label="Commits">
        {hasWorkingChanges && (
          <div
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
        )}
        {rows.map((row) => {
          const badges = parseRefs(row.commit.refs, localBranches, remoteBranches)
          const isSelected = selection.type === 'commit' && selection.hash === row.commit.hash
          const isContextTarget = menu?.hash === row.commit.hash
          return (
            <div
              key={row.commit.hash}
              className={`graph-row ${isSelected ? 'selected' : ''} ${isContextTarget ? 'context-target' : ''}`}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelectCommit(row.commit.hash)}
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
                    onClick={(e) => {
                      if (b.kind === 'head' || b.kind === 'local') {
                        e.stopPropagation()
                        onCheckout(b.label)
                      }
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
        })}
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
