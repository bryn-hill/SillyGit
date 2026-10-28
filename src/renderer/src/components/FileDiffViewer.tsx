import { useEffect, useRef, useState, type JSX } from 'react'
import { pairForSplit, renderFileDiff, type RenderedHunk } from '../lib/diffRender'
import { highlightLine, languageForPath } from '../lib/highlight'

type Mode = 'file' | 'diff'
type Layout = 'unified' | 'split'

interface Props {
  repoPath: string
  /** The commit whose change is shown, or null for an uncommitted change (see `staged`). */
  hash: string | null
  /** For an uncommitted change: whether it's the staged (index) side rather than the working tree's. */
  staged?: boolean
  untracked?: boolean
  path: string
  /** The path before this commit, when it renamed the file. */
  oldPath?: string
  diffText: string
  highlightLine?: number
  onNavigateToCommit?: (hash: string) => void
  onWorkingTreeChanged?: () => void
  /** Opens the working-tree copy of the file in the in-app editor. */
  onEditFile?: (path: string) => void
  /** Opens the file's history or blame view; the buttons are hidden without it. */
  onOpenFileView?: (path: string, ref: string | null, mode: 'history' | 'blame') => void
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

function FileViewPane({
  content,
  lang,
  loading,
  showWhitespace
}: {
  content: string | null
  lang: string | null
  loading: boolean
  showWhitespace: boolean
}): JSX.Element {
  if (loading) return <div className="diff-empty">Loading…</div>
  if (content == null) return <div className="diff-empty">No content.</div>

  const lines = content.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  return (
    <pre className="file-view-content">
      {lines.map((line, idx) => {
        const lineNo = idx + 1
        return (
          <div className="file-view-row" key={lineNo}>
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
  hunkRefs: React.RefObject<Array<HTMLDivElement | null>>
  reverting: string | null
  /** Undefined hides the per-hunk revert button. */
  revert?: HunkRevert
  highlightLine?: number
}

interface HunkRevert {
  label: string
  title: string
  onRevert: (unitId: string) => void
}

function HunkBar({
  hunk,
  reverting,
  revert
}: {
  hunk: RenderedHunk
  reverting: string | null
  revert?: HunkRevert
}): JSX.Element {
  return (
    <div className="diff-hunk-bar">
      <span className="diff-hunk-header-text">{hunk.header}</span>
      {revert && (
        <button
          className="hunk-revert-btn"
          disabled={reverting === hunk.id}
          onClick={() => revert.onRevert(hunk.id)}
          title={revert.title}
        >
          ↺ {reverting === hunk.id ? 'Reverting…' : revert.label}
        </button>
      )}
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
  revert,
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
          <HunkBar hunk={hunk} reverting={reverting} revert={revert} />
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
  revert
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
            <HunkBar hunk={hunk} reverting={reverting} revert={revert} />
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
  staged = false,
  untracked = false,
  path,
  oldPath,
  diffText,
  highlightLine,
  onNavigateToCommit,
  onWorkingTreeChanged,
  onEditFile,
  onOpenFileView
}: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('diff')
  const [layout, setLayout] = useState<Layout>('unified')
  const [showWhitespace, setShowWhitespace] = useState(false)
  const [wrapLines, setWrapLines] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  // The whitespace-ignoring diff, for the diff text it was asked for alongside.
  const [wsDiff, setWsDiff] = useState<{ source: string; text: string } | null>(null)
  const effectiveDiffText = ignoreWhitespace && wsDiff?.source === diffText ? wsDiff.text : diffText

  // The whole file, for the request it answers; anything else means it's still loading.
  const fileRequest = `${repoPath}\0${hash}\0${staged}\0${path}`
  const [file, setFile] = useState<{ request: string; diffText: string; content: string } | null>(null)
  const fileLoaded = file?.request === fileRequest && file.diffText === diffText

  const [activeHunkIndex, setActiveHunkIndex] = useState(0)
  const [reverting, setReverting] = useState<string | null>(null)
  const [revertStatus, setRevertStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const hunkRefs = useRef<Array<HTMLDivElement | null>>([])

  const lang = languageForPath(path)

  // New file or commit selected: reset per-file state while rendering, as
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  // suggests, so the old file's settings never paint for the new one.
  const [shownFile, setShownFile] = useState(fileRequest)
  if (shownFile !== fileRequest) {
    setShownFile(fileRequest)
    setMode('diff')
    setIgnoreWhitespace(false)
    setActiveHunkIndex(0)
    setRevertStatus(null)
  }

  // Jumping to a line needs the unified diff to show it in.
  const highlightRequest = highlightLine == null ? null : `${fileRequest}\0${highlightLine}`
  const [shownHighlight, setShownHighlight] = useState<string | null>(null)
  if (shownHighlight !== highlightRequest) {
    setShownHighlight(highlightRequest)
    if (highlightRequest != null) {
      setMode('diff')
      setLayout('unified')
    }
  }

  useEffect(() => {
    if (!ignoreWhitespace) return
    let cancelled = false
    const request =
      hash == null
        ? window.api.diff(repoPath, path, staged, untracked, true)
        : window.api.commitFileDiff(repoPath, hash, path, true, oldPath)
    request.then((res) => {
      if (cancelled) return
      if (res.ok) setWsDiff({ source: diffText, text: res.data })
    })
    return () => {
      cancelled = true
    }
  }, [ignoreWhitespace, repoPath, hash, staged, untracked, path, oldPath, diffText])

  useEffect(() => {
    if (mode !== 'file') return
    let cancelled = false
    // An uncommitted change shows the file as staged (`:path` is the index copy) or on disk.
    const request =
      hash != null
        ? window.api.fileAtRef(repoPath, hash, path)
        : staged
          ? window.api.fileAtRef(repoPath, '', path)
          : window.api.workingFile(repoPath, path)
    request.then((res) => {
      if (cancelled) return
      setFile({ request: fileRequest, diffText, content: res.ok ? res.data : `Unable to load file: ${res.error}` })
    })
    return () => {
      cancelled = true
    }
  }, [mode, repoPath, hash, staged, path, diffText, fileRequest])

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
      setRevertStatus({ ok: true, message: hash == null ? 'Discarded that change.' : 'Reverted into your working directory.' })
      onWorkingTreeChanged?.()
    } else {
      setRevertStatus({ ok: false, message: res.error })
    }
  }

  // A commit's hunk is undone in the working tree; an unstaged one is simply discarded.
  // Staged and untracked changes have no working-tree hunk to undo this way.
  const revert: HunkRevert | undefined =
    hash != null
      ? { label: 'Revert Hunk', title: 'Revert this change in your working directory', onRevert: handleRevertHunk }
      : !staged && !untracked
        ? { label: 'Discard Hunk', title: 'Discard this change from your working directory', onRevert: handleRevertHunk }
        : undefined

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
          {onOpenFileView && (
            <>
              <button className="text-toggle" onClick={() => onOpenFileView(path, hash, 'blame')} title="Who last changed each line">
                Blame
              </button>
              <button className="text-toggle" onClick={() => onOpenFileView(path, hash, 'history')} title="Every commit that changed this file">
                History
              </button>
            </>
          )}
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

      <div className={`diff-body ${wrapLines ? 'wrap' : ''}`} data-testid="diff-scroller">
        {mode === 'file' ? (
          <FileViewPane
            content={fileLoaded ? file.content : null}
            lang={lang}
            loading={!fileLoaded}
            showWhitespace={showWhitespace}
          />
        ) : layout === 'unified' ? (
          <UnifiedDiff
            hunks={hunks}
            lang={lang}
            showWhitespace={showWhitespace}
            activeHunkIndex={activeHunkIndex}
            hunkRefs={hunkRefs}
            reverting={reverting}
            revert={revert}
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
            revert={revert}
          />
        )}
      </div>
    </div>
  )
}
