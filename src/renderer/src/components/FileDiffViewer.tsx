import { useEffect, useRef, useState, type JSX } from 'react'
import type { BlameLine, CommitInfo } from '../../../shared/types'
import { pairForSplit, renderFileDiff, type RenderedHunk } from '../lib/diffRender'
import { highlightLine, languageForPath } from '../lib/highlight'

type Mode = 'file' | 'diff'
type Layout = 'unified' | 'split'

interface Props {
  repoPath: string
  hash: string
  path: string
  diffText: string
  highlightLine?: number
  onNavigateToCommit: (hash: string) => void
  onWorkingTreeChanged?: () => void
  /** Opens the working-tree copy of the file in the in-app editor. */
  onEditFile?: (path: string) => void
}

function renderLineHtml(text: string, lang: string | null, showWhitespace: boolean): string {
  if (!showWhitespace) return highlightLine(text, lang)
  const trailingMatch = text.match(/[ \t]+$/)
  if (!trailingMatch) return highlightLine(text, lang)
  const main = text.slice(0, text.length - trailingMatch[0].length)
  const markers = [...trailingMatch[0]]
    .map((ch) => `<span class="${ch === '\t' ? 'ws-tab' : 'ws-space'}">${ch === '\t' ? '→' : '·'}</span>`)
    .join('')
  return highlightLine(main, lang) + markers
}

function formatBlameLabel(b: BlameLine): string {
  const name = b.author.split(' ')[0] || b.author
  const date = b.date ? new Date(b.date).toLocaleDateString() : ''
  return [name, date].filter(Boolean).join(' · ')
}

function FileViewPane({
  content,
  lang,
  loading,
  showWhitespace,
  blame
}: {
  content: string | null
  lang: string | null
  loading: boolean
  showWhitespace: boolean
  blame: BlameLine[] | null
}): JSX.Element {
  if (loading) return <div className="diff-empty">Loading…</div>
  if (content == null) return <div className="diff-empty">No content.</div>

  const lines = content.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  const blameByLine = new Map<number, BlameLine>()
  blame?.forEach((b) => blameByLine.set(b.lineNo, b))

  return (
    <pre className="file-view-content">
      {lines.map((line, idx) => {
        const lineNo = idx + 1
        const b = blameByLine.get(lineNo)
        return (
          <div className="file-view-row" key={lineNo}>
            {blame && (
              <span
                className="blame-cell"
                title={b ? `${b.summary}\n${b.author} · ${new Date(b.date).toLocaleString()}` : ''}
              >
                {b ? formatBlameLabel(b) : ''}
              </span>
            )}
            <span className="line-num">{lineNo}</span>
            <span
              className="line-code"
              dangerouslySetInnerHTML={{ __html: renderLineHtml(line, lang, showWhitespace) }}
            />
          </div>
        )
      })}
    </pre>
  )
}

interface HunkListProps {
  hunks: RenderedHunk[]
  lang: string | null
  showWhitespace: boolean
  activeHunkIndex: number
  hunkRefs: React.MutableRefObject<Array<HTMLDivElement | null>>
  reverting: string | null
  onRevert: (unitId: string) => void
  highlightLine?: number
}

function HunkBar({
  hunk,
  reverting,
  onRevert
}: {
  hunk: RenderedHunk
  reverting: string | null
  onRevert: (unitId: string) => void
}): JSX.Element {
  return (
    <div className="diff-hunk-bar">
      <span className="diff-hunk-header-text">{hunk.header}</span>
      <button
        className="hunk-revert-btn"
        disabled={reverting === hunk.id}
        onClick={() => onRevert(hunk.id)}
        title="Revert this change in your working directory"
      >
        ↺ {reverting === hunk.id ? 'Reverting…' : 'Revert Hunk'}
      </button>
    </div>
  )
}

function UnifiedDiff({
  hunks,
  lang,
  showWhitespace,
  activeHunkIndex,
  hunkRefs,
  reverting,
  onRevert,
  highlightLine
}: HunkListProps): JSX.Element {
  const highlightRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (highlightLine == null) return
    highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightLine, hunks])

  if (hunks.length === 0) return <div className="diff-empty">No changes.</div>
  return (
    <div className="diff-unified">
      {hunks.map((hunk, hi) => (
        <div
          key={hunk.id}
          ref={(el) => {
            hunkRefs.current[hi] = el
          }}
          className={`diff-hunk-block ${hi === activeHunkIndex ? 'active' : ''}`}
        >
          <HunkBar hunk={hunk} reverting={reverting} onRevert={onRevert} />
          {hunk.lines.map((line, li) => {
            const isHighlighted = highlightLine != null && line.newLine === highlightLine
            return (
              <div
                key={li}
                ref={isHighlighted ? highlightRef : undefined}
                className={`diff-row diff-row-${line.type} ${isHighlighted ? 'diff-row-highlight' : ''}`}
              >
                <span className="gutter-num gutter-old">{line.oldLine ?? ''}</span>
                <span className="gutter-num gutter-new">{line.newLine ?? ''}</span>
                <span className="gutter-marker">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ''}
                </span>
                <span
                  className="line-code"
                  dangerouslySetInnerHTML={{ __html: renderLineHtml(line.text, lang, showWhitespace) }}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function SplitDiff({
  hunks,
  lang,
  showWhitespace,
  activeHunkIndex,
  hunkRefs,
  reverting,
  onRevert
}: HunkListProps): JSX.Element {
  if (hunks.length === 0) return <div className="diff-empty">No changes.</div>
  return (
    <div className="diff-split">
      {hunks.map((hunk, hi) => {
        const rows = pairForSplit(hunk.lines)
        return (
          <div
            key={hunk.id}
            ref={(el) => {
              hunkRefs.current[hi] = el
            }}
            className={`diff-hunk-block ${hi === activeHunkIndex ? 'active' : ''}`}
          >
            <HunkBar hunk={hunk} reverting={reverting} onRevert={onRevert} />
            <div className="diff-split-rows">
              {rows.map((row, ri) => (
                <div key={ri} className="diff-split-row">
                  <div className={`diff-split-cell diff-row-${row.left?.type ?? 'blank'}`}>
                    <span className="gutter-num">{row.left?.oldLine ?? ''}</span>
                    <span
                      className="line-code"
                      dangerouslySetInnerHTML={{
                        __html: row.left ? renderLineHtml(row.left.text, lang, showWhitespace) : ''
                      }}
                    />
                  </div>
                  <div className={`diff-split-cell diff-row-${row.right?.type ?? 'blank'}`}>
                    <span className="gutter-num">{row.right?.newLine ?? ''}</span>
                    <span
                      className="line-code"
                      dangerouslySetInnerHTML={{
                        __html: row.right ? renderLineHtml(row.right.text, lang, showWhitespace) : ''
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function FileDiffViewer({
  repoPath,
  hash,
  path,
  diffText,
  highlightLine,
  onNavigateToCommit,
  onWorkingTreeChanged,
  onEditFile
}: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('diff')
  const [layout, setLayout] = useState<Layout>('unified')
  const [showBlame, setShowBlame] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showWhitespace, setShowWhitespace] = useState(false)
  const [wrapLines, setWrapLines] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [effectiveDiffText, setEffectiveDiffText] = useState(diffText)

  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [blameLines, setBlameLines] = useState<BlameLine[] | null>(null)
  const [blameLoading, setBlameLoading] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<CommitInfo[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const [activeHunkIndex, setActiveHunkIndex] = useState(0)
  const [reverting, setReverting] = useState<string | null>(null)
  const [revertStatus, setRevertStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const hunkRefs = useRef<Array<HTMLDivElement | null>>([])

  const lang = languageForPath(path)

  // New file selected (or a History click navigated to a different commit) — reset per-file state.
  useEffect(() => {
    setMode('diff')
    setShowBlame(false)
    setShowHistory(false)
    setIgnoreWhitespace(false)
    setEffectiveDiffText(diffText)
    setActiveHunkIndex(0)
    setRevertStatus(null)
    hunkRefs.current = []
  }, [repoPath, hash, path]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (highlightLine == null) return
    setMode('diff')
    setLayout('unified')
  }, [highlightLine, repoPath, hash, path])

  useEffect(() => {
    if (!ignoreWhitespace) {
      setEffectiveDiffText(diffText)
      return
    }
    let cancelled = false
    window.api.commitFileDiff(repoPath, hash, path, true).then((res) => {
      if (cancelled) return
      if (res.ok) setEffectiveDiffText(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [ignoreWhitespace, repoPath, hash, path, diffText])

  useEffect(() => {
    if (mode !== 'file') return
    let cancelled = false
    setFileLoading(true)
    window.api.fileAtRef(repoPath, hash, path).then((res) => {
      if (cancelled) return
      setFileLoading(false)
      setFileContent(res.ok ? res.data : `Unable to load file: ${res.error}`)
    })
    return () => {
      cancelled = true
    }
  }, [mode, repoPath, hash, path])

  useEffect(() => {
    if (!showBlame || mode !== 'file') return
    let cancelled = false
    setBlameLoading(true)
    window.api.blame(repoPath, hash, path).then((res) => {
      if (cancelled) return
      setBlameLoading(false)
      if (res.ok) setBlameLines(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [showBlame, mode, repoPath, hash, path])

  useEffect(() => {
    if (!showHistory) return
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
    window.api.fileHistory(repoPath, path, hash).then((res) => {
      if (cancelled) return
      setHistoryLoading(false)
      if (res.ok) setHistoryEntries(res.data)
      else setHistoryError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [showHistory, repoPath, path, hash])

  useEffect(() => {
    if (!revertStatus) return
    const t = setTimeout(() => setRevertStatus(null), 4000)
    return () => clearTimeout(t)
  }, [revertStatus])

  const hunks = renderFileDiff(effectiveDiffText)

  const gotoHunk = (index: number): void => {
    if (hunks.length === 0) return
    const clamped = (index + hunks.length) % hunks.length
    setActiveHunkIndex(clamped)
    hunkRefs.current[clamped]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const handleEditInWorkingDir = async (): Promise<void> => {
    const base = repoPath.replace(/\/+$/, '')
    const res = await window.api.openPath(`${base}/${path}`)
    if (!res.ok) setRevertStatus({ ok: false, message: res.error })
  }

  const handleRevertHunk = async (unitId: string): Promise<void> => {
    setReverting(unitId)
    setRevertStatus(null)
    const res = await window.api.revertHunk(repoPath, effectiveDiffText, unitId)
    setReverting(null)
    if (res.ok) {
      setRevertStatus({ ok: true, message: 'Reverted into your working directory.' })
      onWorkingTreeChanged?.()
    } else {
      setRevertStatus({ ok: false, message: res.error })
    }
  }

  return (
    <div className="file-diff-viewer">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <button
            className="edit-working-btn"
            onClick={() => (onEditFile ? onEditFile(path) : void handleEditInWorkingDir())}
            title="Edit the working directory copy of this file"
          >
            ✎ Edit file
          </button>
          <button className="icon-button" onClick={handleEditInWorkingDir} title="Open in external editor" aria-label="Open in external editor">
            ↗
          </button>
        </div>
        <div className="diff-toolbar-center">
          <div className="toggle-group">
            <button className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>
              File View
            </button>
            <button className={mode === 'diff' ? 'active' : ''} onClick={() => setMode('diff')}>
              Diff View
            </button>
          </div>
          <button className={`text-toggle ${showBlame ? 'active' : ''}`} onClick={() => setShowBlame((v) => !v)}>
            Blame
          </button>
          <button className={`text-toggle ${showHistory ? 'active' : ''}`} onClick={() => setShowHistory((v) => !v)}>
            History
          </button>
        </div>
        <div className="diff-toolbar-right">
          {mode === 'diff' && (
            <div className="hunk-nav">
              <button className="icon-button" onClick={() => gotoHunk(activeHunkIndex - 1)} disabled={hunks.length === 0} title="Previous change">
                ↑
              </button>
              <span className="hunk-nav-count">{hunks.length ? `${activeHunkIndex + 1}/${hunks.length}` : '0/0'}</span>
              <button className="icon-button" onClick={() => gotoHunk(activeHunkIndex + 1)} disabled={hunks.length === 0} title="Next change">
                ↓
              </button>
            </div>
          )}
          {mode === 'diff' && (
            <div className="toggle-group">
              <button className={layout === 'unified' ? 'active' : ''} onClick={() => setLayout('unified')} title="Unified view">
                ▤
              </button>
              <button className={layout === 'split' ? 'active' : ''} onClick={() => setLayout('split')} title="Split view">
                ▥
              </button>
            </div>
          )}
          <button
            className={`icon-button ${showWhitespace ? 'active' : ''}`}
            onClick={() => setShowWhitespace((v) => !v)}
            title="Show trailing whitespace"
          >
            ¶
          </button>
          <div className="menu-wrap">
            <button className="icon-button" onClick={() => setShowMenu((v) => !v)} title="More actions">
              ☰
            </button>
            {showMenu && (
              <>
                <div className="dropdown-backdrop" onClick={() => setShowMenu(false)} />
                <div className="diff-menu">
                  <label className="diff-menu-item">
                    <input
                      type="checkbox"
                      checked={ignoreWhitespace}
                      onChange={(e) => setIgnoreWhitespace(e.target.checked)}
                      disabled={mode !== 'diff'}
                    />
                    Ignore whitespace changes
                  </label>
                  <label className="diff-menu-item">
                    <input type="checkbox" checked={wrapLines} onChange={(e) => setWrapLines(e.target.checked)} />
                    Wrap long lines
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {revertStatus && (
        <div className={`revert-status ${revertStatus.ok ? 'ok' : 'error'}`}>{revertStatus.message}</div>
      )}

      {showHistory && (
        <div className="file-history-panel">
          {historyLoading ? (
            <div className="diff-empty">Loading history…</div>
          ) : historyError ? (
            <div className="diff-empty">{historyError}</div>
          ) : (
            historyEntries.map((entry) => (
              <div
                key={entry.hash}
                className={`file-history-row ${entry.hash === hash ? 'current' : ''}`}
                onClick={() => onNavigateToCommit(entry.hash)}
              >
                <span className="file-history-hash">{entry.hash.slice(0, 7)}</span>
                <span className="file-history-subject">{entry.subject}</span>
                <span className="file-history-meta">
                  {entry.author} · {entry.date}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <div className={`diff-body ${wrapLines ? 'wrap' : ''}`} data-testid="diff-scroller">
        {mode === 'file' ? (
          <FileViewPane
            content={fileContent}
            lang={lang}
            loading={fileLoading}
            showWhitespace={showWhitespace}
            blame={showBlame ? (blameLoading ? null : blameLines) : null}
          />
        ) : layout === 'unified' ? (
          <UnifiedDiff
            hunks={hunks}
            lang={lang}
            showWhitespace={showWhitespace}
            activeHunkIndex={activeHunkIndex}
            hunkRefs={hunkRefs}
            reverting={reverting}
            onRevert={handleRevertHunk}
            highlightLine={highlightLine}
          />
        ) : (
          <SplitDiff
            hunks={hunks}
            lang={lang}
            showWhitespace={showWhitespace}
            activeHunkIndex={activeHunkIndex}
            hunkRefs={hunkRefs}
            reverting={reverting}
            onRevert={handleRevertHunk}
          />
        )}
      </div>
    </div>
  )
}
