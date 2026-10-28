import { useEffect, useMemo, useState, type JSX } from 'react'
import type { BlameLine, FileHistoryEntry } from '../../../shared/types'
import { blameBlocks, blameHeatScale } from '../lib/blame'
import { highlightLine, languageForPath } from '../lib/highlight'
import { timeAgo } from '../lib/time'
import Avatar from './Avatar'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import FileDiffViewer from './FileDiffViewer'

export type FileViewMode = 'history' | 'blame'

/** What the file view is open on: a file, and the commit to start from (null for the working tree). */
export interface FileViewTarget {
  path: string
  ref: string | null
  mode: FileViewMode
}

interface Props {
  repoPath: string
  target: FileViewTarget
  onClose: () => void
  /** Opens the full commit view on that commit, showing this file. */
  onOpenCommit: (hash: string, path: string) => void
  /** Closes this view and selects the commit in the graph. */
  onShowInGraph: (hash: string) => void
  onCopyText: (text: string) => void
  onEditFile?: (path: string) => void
  onWorkingTreeChanged?: () => void
}

const PAGE = 200

function shortRef(ref: string | null): string {
  if (!ref) return 'working tree'
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref
}

/**
 * GitKraken's file history and blame, in place of the graph: the commits that changed
 * a file (following renames) with each one's diff, or every line with the commit that
 * last changed it.
 */
export default function FileHistoryView({
  repoPath,
  target,
  onClose,
  onOpenCommit,
  onShowInGraph,
  onCopyText,
  onEditFile,
  onWorkingTreeChanged
}: Props): JSX.Element {
  const [mode, setMode] = useState<FileViewMode>(target.mode)
  const [menuOpen, setMenuOpen] = useState(false)

  // History
  const [limit, setLimit] = useState(PAGE)
  const [entries, setEntries] = useState<FileHistoryEntry[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [selectedHash, setSelectedHash] = useState<string | null>(target.ref)
  const [diffText, setDiffText] = useState<string | null>(null)

  // Blame: which version of the file is blamed, which can step back past a change.
  const [blameAt, setBlameAt] = useState<{ ref: string | null; path: string }>({ ref: target.ref, path: target.path })
  const [blame, setBlame] = useState<BlameLine[] | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [blameError, setBlameError] = useState<string | null>(null)
  const [hoverHash, setHoverHash] = useState<string | null>(null)
  const [lineMenu, setLineMenu] = useState<{ x: number; y: number; line: BlameLine } | null>(null)

  useEffect(() => {
    setMode(target.mode)
    setLimit(PAGE)
    setSelectedHash(target.ref)
    setBlameAt({ ref: target.ref, path: target.path })
  }, [repoPath, target])

  useEffect(() => {
    if (mode !== 'history') return
    let cancelled = false
    setHistoryError(null)
    window.api.fileHistory(repoPath, target.path, target.ref ?? 'HEAD', limit).then((res) => {
      if (cancelled) return
      if (res.ok) setEntries(res.data)
      else setHistoryError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [mode, repoPath, target, limit])

  const selected = entries?.find((e) => e.hash === selectedHash) ?? entries?.[0] ?? null

  useEffect(() => {
    if (mode !== 'history' || !selected) return
    let cancelled = false
    setDiffText(null)
    window.api.commitFileDiff(repoPath, selected.hash, selected.path, false, selected.oldPath).then((res) => {
      if (!cancelled) setDiffText(res.ok ? res.data : `Unable to load diff: ${res.error}`)
    })
    return () => {
      cancelled = true
    }
  }, [mode, repoPath, selected?.hash, selected?.path, selected?.oldPath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'blame') return
    let cancelled = false
    setBlame(null)
    setContent(null)
    setBlameError(null)
    const { ref, path } = blameAt
    Promise.all([
      window.api.blame(repoPath, ref, path),
      ref ? window.api.fileAtRef(repoPath, ref, path) : window.api.workingFile(repoPath, path)
    ]).then(([blameRes, contentRes]) => {
      if (cancelled) return
      if (!blameRes.ok) setBlameError(blameRes.error)
      else if (!contentRes.ok) setBlameError(contentRes.error)
      else {
        setBlame(blameRes.data)
        setContent(contentRes.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [mode, repoPath, blameAt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !lineMenu && !menuOpen) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, lineMenu, menuOpen])

  const showInHistory = (hash: string): void => {
    setSelectedHash(hash)
    setMode('history')
  }

  const blameVersion = (entry: FileHistoryEntry): void => {
    setBlameAt({ ref: entry.hash, path: entry.path })
    setMode('blame')
  }

  const lineMenuSections = (line: BlameLine): ContextMenuItem[][] => {
    const commitItems: ContextMenuItem[] = line.uncommitted
      ? [{ id: 'uncommitted', label: 'Not committed yet', disabled: true }]
      : [
          { id: 'history', label: 'Show commit in file history', onSelect: () => showInHistory(line.hash) },
          { id: 'open', label: 'Open commit', onSelect: () => onOpenCommit(line.hash, line.path) },
          { id: 'graph', label: 'Show in graph', onSelect: () => onShowInGraph(line.hash) }
        ]
    const previous = line.previous
    const more: ContextMenuItem[] = []
    if (previous) {
      more.push({
        id: 'blame-previous',
        label: 'Blame before this change',
        title: `${previous.path} at ${previous.hash.slice(0, 7)}`,
        onSelect: () => setBlameAt({ ref: previous.hash, path: previous.path })
      })
    }
    if (!line.uncommitted) more.push({ id: 'copy', label: 'Copy commit SHA', onSelect: () => onCopyText(line.hash) })
    return more.length > 0 ? [commitItems, more] : [commitItems]
  }

  const atLatest = blameAt.ref === target.ref && blameAt.path === target.path

  return (
    <div className="file-history-view commit-fullview" role="region" aria-label="File history and blame">
      <div className="commit-fullview-header">
        <button className="icon-button" onClick={onClose} title="Back to repository view">
          ←
        </button>
        <span className="commit-fullview-title" title={target.path}>
          {target.path}
        </span>
        <div className="toggle-group" role="group" aria-label="File view">
          <button className={mode === 'history' ? 'active' : ''} aria-pressed={mode === 'history'} onClick={() => setMode('history')}>
            History
          </button>
          <button className={mode === 'blame' ? 'active' : ''} aria-pressed={mode === 'blame'} onClick={() => setMode('blame')}>
            Blame
          </button>
        </div>
        {onEditFile && (
          <button className="icon-button" title="Edit file" aria-label="Edit file" onClick={() => onEditFile(target.path)}>
            ✎
          </button>
        )}
        <button className="icon-button" onClick={onClose} title="Close" aria-label="Close file view">
          ✕
        </button>
      </div>

      {mode === 'history' ? (
        <div className="commit-fullview-body">
          <div className="file-history-list" role="list" aria-label="Commits changing this file">
            {historyError ? (
              <div className="commit-fullview-empty">{historyError}</div>
            ) : !entries ? (
              <div className="commit-fullview-empty">Loading history…</div>
            ) : entries.length === 0 ? (
              <div className="commit-fullview-empty">No commits change this file.</div>
            ) : (
              <>
                {entries.map((entry) => (
                  <div
                    key={entry.hash}
                    role="listitem"
                    aria-current={entry === selected}
                    className={`file-history-entry ${entry === selected ? 'active' : ''}`}
                    onClick={() => setSelectedHash(entry.hash)}
                    onDoubleClick={() => onOpenCommit(entry.hash, entry.path)}
                  >
                    <Avatar name={entry.author} email={entry.authorEmail} hash={entry.hash} repoPath={repoPath} size={22} />
                    <div className="file-history-entry-text">
                      <div className="file-history-entry-subject">{entry.subject}</div>
                      <div className="file-history-entry-meta">
                        <span>{entry.author}</span>
                        <span title={new Date(entry.date).toLocaleString()}>{timeAgo(entry.date)}</span>
                        <span className="file-history-hash">{entry.hash.slice(0, 7)}</span>
                      </div>
                      {entry.oldPath && entry.oldPath !== entry.path && (
                        <div className="file-history-rename" title={`${entry.oldPath} → ${entry.path}`}>
                          {entry.status === 'C' ? 'Copied' : 'Renamed'} from {entry.oldPath}
                        </div>
                      )}
                    </div>
                    {entry.status && (
                      <span className={`status-code code-${entry.status}`} title={entry.path}>
                        {entry.status}
                      </span>
                    )}
                  </div>
                ))}
                {entries.length >= limit && (
                  <button className="file-history-more" onClick={() => setLimit((n) => n + PAGE)}>
                    Load more
                  </button>
                )}
              </>
            )}
          </div>
          <div className="commit-fullview-diff file-history-diff" data-testid="diff">
            {selected && (
              <div className="file-history-diff-bar">
                <span className="file-history-diff-title" title={selected.subject}>
                  {selected.subject}
                </span>
                <button onClick={() => blameVersion(selected)} disabled={selected.status === 'D'}>
                  Blame this version
                </button>
                <button onClick={() => onOpenCommit(selected.hash, selected.path)}>Open commit</button>
                <button onClick={() => onShowInGraph(selected.hash)}>Show in graph</button>
              </div>
            )}
            {!selected ? null : diffText == null ? (
              <div className="commit-fullview-empty">Loading diff…</div>
            ) : (
              <FileDiffViewer
                repoPath={repoPath}
                hash={selected.hash}
                path={selected.path}
                oldPath={selected.oldPath}
                diffText={diffText}
                onNavigateToCommit={showInHistory}
                onWorkingTreeChanged={onWorkingTreeChanged}
                onEditFile={onEditFile}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="blame-view">
          <div className="blame-bar">
            <span>
              {blameAt.path !== target.path && <span className="blame-bar-path">{blameAt.path} </span>}
              at <span className="file-history-hash">{shortRef(blameAt.ref)}</span>
            </span>
            {!atLatest && (
              <button onClick={() => setBlameAt({ ref: target.ref, path: target.path })}>
                Back to {shortRef(target.ref)}
              </button>
            )}
          </div>
          {blameError ? (
            <div className="commit-fullview-empty">{blameError}</div>
          ) : !blame || content == null ? (
            <div className="commit-fullview-empty">Loading blame…</div>
          ) : (
            <BlameTable
              repoPath={repoPath}
              path={blameAt.path}
              blame={blame}
              content={content}
              hoverHash={hoverHash}
              onHover={setHoverHash}
              onPick={(line) => !line.uncommitted && showInHistory(line.hash)}
              onContextMenu={(line, x, y) => setLineMenu({ x, y, line })}
            />
          )}
        </div>
      )}
      {lineMenu && (
        <ContextMenu x={lineMenu.x} y={lineMenu.y} sections={lineMenuSections(lineMenu.line)} onClose={() => setLineMenu(null)} />
      )}
    </div>
  )
}

function BlameTable({
  repoPath,
  path,
  blame,
  content,
  hoverHash,
  onHover,
  onPick,
  onContextMenu
}: {
  repoPath: string
  path: string
  blame: BlameLine[]
  content: string
  hoverHash: string | null
  onHover: (hash: string | null) => void
  onPick: (line: BlameLine) => void
  onContextMenu: (line: BlameLine, x: number, y: number) => void
}): JSX.Element {
  const lang = languageForPath(path)
  const lines = useMemo(() => {
    const all = content.split('\n')
    if (all.length > 0 && all[all.length - 1] === '') all.pop()
    return all
  }, [content])
  const blocks = useMemo(() => blameBlocks(blame), [blame])
  const heat = useMemo(() => blameHeatScale(blame), [blame])
  const blockStarts = useMemo(() => new Map(blocks.map((b) => [b.start, b])), [blocks])
  const byLine = useMemo(() => new Map(blame.map((b) => [b.lineNo, b])), [blame])

  return (
    <div className="diff-body blame-body" data-testid="blame">
      <div className="blame-table">
        {lines.map((text, idx) => {
          const lineNo = idx + 1
          const line = byLine.get(lineNo)
          const block = blockStarts.get(lineNo)
          const shade = line ? heat(line) : 0
          return (
            <div
              key={lineNo}
              className={`blame-row ${block ? 'block-start' : ''} ${line && line.hash === hoverHash ? 'hovered' : ''}`}
              data-line={lineNo}
              onMouseEnter={() => onHover(line?.hash ?? null)}
            >
              <div
                className={`blame-gutter ${line?.uncommitted ? 'uncommitted' : ''}`}
                title={
                  line
                    ? line.uncommitted
                      ? 'Not committed yet'
                      : `${line.summary}\n${line.author} · ${new Date(line.date).toLocaleString()} · ${line.hash.slice(0, 7)}`
                    : ''
                }
                onClick={() => line && onPick(line)}
                onContextMenu={(e) => {
                  if (!line) return
                  e.preventDefault()
                  onContextMenu(line, e.clientX, e.clientY)
                }}
              >
                <span className="blame-heat" style={{ opacity: 0.15 + shade * 0.85 }} />
                {block && line && (
                  <>
                    {line.uncommitted ? (
                      <span className="blame-uncommitted-dot" />
                    ) : (
                      <Avatar name={line.author} email={line.authorEmail} hash={line.hash} repoPath={repoPath} size={16} />
                    )}
                    <span className="blame-author">{line.uncommitted ? 'You' : line.author}</span>
                    <span className="blame-summary">{line.uncommitted ? 'Uncommitted changes' : line.summary}</span>
                    <span className="blame-date">{line.uncommitted ? '' : timeAgo(line.date)}</span>
                  </>
                )}
              </div>
              <span className="line-num">{lineNo}</span>
              <span className="line-code" dangerouslySetInnerHTML={{ __html: highlightLine(text, lang) }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
