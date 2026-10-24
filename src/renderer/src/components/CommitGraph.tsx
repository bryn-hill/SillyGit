import type { GraphRow } from '../lib/graphLayout'
import GraphCell, { WipGraphCell } from './GraphCell'
import type { Selection } from '../App'

interface RefBadge {
  label: string
  kind: 'head' | 'local' | 'remote' | 'tag'
}

function parseRefs(refs: string[]): RefBadge[] {
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
    } else if (label.startsWith('origin/') || label.includes('/')) {
      kind = 'remote'
    }
    if (label === 'HEAD') continue
    badges.push({ label, kind })
  }
  return badges
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
  onSelectWorking: () => void
  onSelectCommit: (hash: string) => void
  onCheckout: (branch: string) => void
}

export default function CommitGraph({
  rows,
  selection,
  hasWorkingChanges,
  onSelectWorking,
  onSelectCommit,
  onCheckout
}: Props): JSX.Element {
  const topLane = rows[0]?.lane ?? 0
  const topColor = rows[0]?.color ?? '#bd93f9'

  return (
    <div className="commit-graph">
      <div className="commit-graph-header">
        <span className="col-graph">Graph</span>
        <span className="col-message">Commit message</span>
      </div>
      <div className="commit-graph-body">
        {hasWorkingChanges && (
          <div
            className={`graph-row wip-row ${selection.type === 'working' ? 'selected' : ''}`}
            onClick={onSelectWorking}
          >
            <WipGraphCell lane={topLane} color={topColor} />
            <div className="graph-row-message">
              <span className="wip-label">// WIP</span>
              <span className="graph-row-subject" style={{ color: topColor }}>
                Uncommitted changes
              </span>
            </div>
          </div>
        )}
        {rows.map((row) => {
          const badges = parseRefs(row.commit.refs)
          const isSelected = selection.type === 'commit' && selection.hash === row.commit.hash
          return (
            <div
              key={row.commit.hash}
              className={`graph-row ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectCommit(row.commit.hash)}
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
    </div>
  )
}
