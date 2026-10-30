import { useEffect, useState, type JSX } from 'react'
import { compareLabel, type CompareCommit, type CompareTarget, type Comparison } from '../../../shared/compare'
import { pressable } from '../lib/pressable'
import { onFileListKeyDown } from '../lib/fileListNav'
import LfsBadge from './LfsBadge'
import FileDiffViewer from './FileDiffViewer'

interface Props {
  repoPath: string
  target: CompareTarget
  onClose: () => void
  /** Compares the other way round. */
  onSwap: () => void
  /** Leaves the comparison and selects a commit in the graph. */
  onShowCommit: (hash: string) => void
}

function CommitList({
  label,
  commits,
  onShowCommit
}: {
  label: string
  commits: CompareCommit[]
  onShowCommit: (hash: string) => void
}): JSX.Element {
  return (
    <div className="compare-section">
      <div className="detail-section-header">
        <span>
          {label} ({commits.length})
        </span>
      </div>
      {commits.length === 0 ? (
        <div className="compare-none">None</div>
      ) : (
        <ul className="file-list" aria-label={label}>
          {commits.map((c) => (
            <li key={c.hash}>
              <div className="file-row" title={`${c.author} · Show in graph`} {...pressable(() => onShowCommit(c.hash))}>
                <span className="multi-commit-sha">{c.hash.slice(0, 7)}</span>
                <span className="file-path">{c.subject}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Two commits or branches side by side, in place of the graph: the files that
 * differ between them with each file's diff, and the commits only one side has.
 * The parent keys it by what's compared, so it only ever loads one comparison.
 */
export default function CompareView({ repoPath, target, onClose, onSwap, onShowCommit }: Props): JSX.Element {
  const { from, to } = target
  const [result, setResult] = useState<{ comparison: Comparison } | { error: string } | null>(null)
  const [pickedPath, setPickedPath] = useState<string | null>(null)
  // The last loaded diff and the file it's for, kept up while the next file's loads.
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.compare(repoPath, from, to).then((res) => {
      if (!cancelled) setResult(res.ok ? { comparison: res.data } : { error: res.error })
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, from, to])

  const comparison = result && 'comparison' in result ? result.comparison : null
  const files = comparison?.files ?? []
  const active = files.find((f) => f.path === pickedPath) ?? files[0] ?? null
  const fromHash = comparison?.fromHash
  const toHash = comparison?.toHash
  const activePath = active?.path
  const activeOldPath = active?.origPath

  useEffect(() => {
    if (!fromHash || !toHash || !activePath) return
    let cancelled = false
    window.api.compareFileDiff(repoPath, fromHash, toHash, activePath, false, activeOldPath).then((res) => {
      if (!cancelled) setDiff({ path: activePath, text: res.ok ? res.data : `Unable to load diff: ${res.error}` })
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, fromHash, toHash, activePath, activeOldPath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fromLabel = compareLabel(from)
  const toLabel = compareLabel(to)
  const shownDiff = diff && files.some((f) => f.path === diff.path) ? diff : null

  return (
    <div className="commit-fullview compare-view" role="region" aria-label="Compare">
      <div className="commit-fullview-header">
        <button className="icon-button" onClick={onClose} title="Back to repository view">
          ←
        </button>
        <span className="commit-fullview-title compare-title">
          Compare <span className="compare-ref" title={from}>{fromLabel}</span>
          <span className="compare-arrow" aria-label="to">
            →
          </span>
          <span className="compare-ref" title={to}>
            {toLabel}
          </span>
        </span>
        <button className="text-toggle" onClick={onSwap} title={`Show the change from ${toLabel} to ${fromLabel}`}>
          ⇄ Swap
        </button>
        <button className="icon-button" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      {result && 'error' in result ? (
        <div className="commit-fullview-empty">{result.error}</div>
      ) : !comparison ? (
        <div className="commit-fullview-empty">Comparing…</div>
      ) : (
        <div className="commit-fullview-body">
          <div className="compare-sidebar">
            <div className="compare-summary" data-testid="compare-summary">
              {comparison.mergeBase == null
                ? 'No common history'
                : comparison.mergeBase === comparison.fromHash || comparison.mergeBase === comparison.toHash
                  ? 'One side is an ancestor of the other'
                  : `Both grew from ${comparison.mergeBase.slice(0, 7)}`}
            </div>
            <div className="compare-section">
              <div className="detail-section-header">
                <span>Files changed ({files.length})</span>
              </div>
              {files.length === 0 ? (
                <div className="compare-none">{fromLabel} and {toLabel} have the same files.</div>
              ) : (
                <ul className="file-list" aria-label="Files changed" onKeyDown={onFileListKeyDown}>
                  {files.map((f) => (
                    <li key={f.path}>
                      <div
                        className={`file-row ${active?.path === f.path ? 'active' : ''}`}
                        aria-current={active?.path === f.path}
                        tabIndex={-1}
                        title={f.origPath ? `${f.origPath} → ${f.path}` : f.path}
                        onClick={() => setPickedPath(f.path)}
                      >
                        <span className={`status-code code-${f.status[0]}`}>{f.status[0]}</span>
                        <span className="file-path">{f.path}</span>
                        {f.lfs && <LfsBadge />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <CommitList label={`Only in ${toLabel}`} commits={comparison.onlyTo} onShowCommit={onShowCommit} />
            <CommitList label={`Only in ${fromLabel}`} commits={comparison.onlyFrom} onShowCommit={onShowCommit} />
            {comparison.truncated && <div className="compare-none">Showing the newest commits only.</div>}
          </div>
          <div className="commit-fullview-diff" data-testid="diff">
            {files.length === 0 ? (
              <div className="commit-fullview-empty">No differences.</div>
            ) : !shownDiff ? (
              <div className="commit-fullview-empty">Loading diff…</div>
            ) : (
              <FileDiffViewer
                repoPath={repoPath}
                hash={comparison.toHash}
                base={comparison.fromHash}
                path={shownDiff.path}
                oldPath={files.find((f) => f.path === shownDiff.path)?.origPath}
                diffText={shownDiff.text}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
