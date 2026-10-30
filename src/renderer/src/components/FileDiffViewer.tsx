import { useContext, useEffect, useRef, useState, type JSX } from 'react'
import type { PartialAction } from '../../../shared/lineStaging'
import type { WordRange } from '../../../shared/wordDiff'
import { pairForSplit, renderFileDiff, type RenderedDiffLine, type RenderedHunk } from '../lib/diffRender'
import { selectDiffLine, type PickedLines } from '../lib/lineSelection'
import { highlightLine, languageForPath } from '../lib/highlight'
import { formatBytes, imageMime } from '../../../shared/imageDiff'
import { LFS_MISSING_NOTE, isLfsPointerDiff, type LfsDiff } from '../../../shared/lfs'
import { LfsContext } from '../lib/lfs'
import ImageDiff from './ImageDiff'
import { EditorContext } from '../lib/editorMenu'
import ContextMenu from './ContextMenu'
import { laneColor, type DiffLanes } from '../lib/lanes'

type Mode = 'file' | 'diff'
type Layout = 'unified' | 'split'

interface Props {
  repoPath: string
  /** The commit whose change is shown, or null for an uncommitted change (see `staged`). */
  hash: string | null
  /** Shows the change from this commit to `hash` instead of `hash`'s own change, for a comparison. */
  base?: string
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
  /** While lanes are on (working changes only): each line's lane, and moving lines to another. */
  lanes?: DiffLanes
  /** Just shows the change, with no hunk actions (a stash's file, say). */
  readOnly?: boolean
}

/** A changed line's lane, to edge it in the lane's colour. */
type LaneOf = (line: RenderedDiffLine) => { name: string; color: number } | null

/** The class and colour for a line its lane owns. */
function laneProps(laneOf: LaneOf | undefined, line: RenderedDiffLine | null): { className: string; style?: React.CSSProperties } {
  const lane = line && laneOf?.(line)
  if (!lane) return { className: '' }
  return { className: 'lane-owned', style: { '--lane-color': laneColor(lane.color) } as React.CSSProperties }
}

function renderLineHtml(text: string, lang: string | null, showWhitespace: boolean, words?: WordRange[] | null): string {
  if (!showWhitespace) return highlightLine(text, lang, words)
  const trailingMatch = text.match(/[ \t]+$/)
  if (!trailingMatch) return highlightLine(text, lang, words)
  const main = text.slice(0, text.length - trailingMatch[0].length)
  const markers = [...trailingMatch[0]]
    .map((ch) => `<span class="${ch === '\t' ? 'ws-tab' : 'ws-space'}">${ch === '\t' ? '→' : '·'}</span>`)
    .join('')
  return highlightLine(main, lang, words) + markers
}

/** A file's lines, numbered and highlighted. */
export function FileViewPane({
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
  /** The hunk an action is running on. */
  busy: string | null
  /** The buttons on each hunk's bar; empty hides them. */
  actions: HunkAction[]
  selection: LineSelection | null
  /** Undefined means lines can't be picked (a commit's diff). */
  onSelectLine?: (hunkId: string, index: number, extend: boolean) => void
  onClearSelection: () => void
  highlightLine?: number
  laneOf?: LaneOf
}

interface HunkAction {
  /** Verb on the button: "Stage", "Discard"… followed by "Hunk" or the selected line count. */
  verb: string
  busyLabel: string
  title: string
  icon: string
  /** Whether the action can take only the selected lines. */
  lines: boolean
  /** `at` is where the button is, for an action that opens a menu. */
  run: (hunkId: string, lines: number[] | null, at: { x: number; y: number }) => void
}

/** Lines picked in one hunk, for the diff text they were picked from. */
interface LineSelection extends PickedLines {
  diffText: string
}

function HunkBar({
  hunk,
  busy,
  actions,
  selected,
  onClearSelection,
  laneOf
}: {
  hunk: RenderedHunk
  busy: string | null
  actions: HunkAction[]
  selected: number[] | null
  onClearSelection: () => void
  laneOf?: LaneOf
}): JSX.Element {
  const count = selected?.length ?? 0
  const lanes = new Map<string, number>()
  if (laneOf) for (const line of hunk.lines) {
    const lane = line.type === 'context' ? null : laneOf(line)
    if (lane) lanes.set(lane.name, lane.color)
  }
  return (
    <div className="diff-hunk-bar">
      <span className="diff-hunk-header-text">{hunk.header}</span>
      {lanes.size > 0 && (
        <span className="hunk-lanes" aria-label="Lanes">
          {[...lanes].map(([name, color]) => (
            <span key={name} className="hunk-lane-chip" style={{ '--lane-color': laneColor(color) } as React.CSSProperties}>
              {name}
            </span>
          ))}
        </span>
      )}
      {actions.length > 0 && (
        <span className="hunk-actions">
          {count > 0 && (
            <button className="hunk-clear-btn" onClick={onClearSelection} title="Clear the line selection">
              {count} selected ✕
            </button>
          )}
          {actions.map((action) => {
            const partial = count > 0 && action.lines
            return (
              <button
                key={action.verb}
                className="hunk-revert-btn"
                disabled={busy === hunk.id}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  action.run(hunk.id, partial ? selected : null, { x: r.left, y: r.bottom + 4 })
                }}
                title={action.title}
              >
                {action.icon}{' '}
                {busy === hunk.id
                  ? action.busyLabel
                  : `${action.verb} ${partial ? `${count} ${count === 1 ? 'Line' : 'Lines'}` : 'Hunk'}`}
              </button>
            )
          })}
        </span>
      )}
    </div>
  )
}

/** The click target over a changed line's gutter that picks it for a line action. */
function LineGutter({
  hunkId,
  index,
  line,
  checked,
  onSelectLine,
  children
}: {
  hunkId: string
  index: number
  line: RenderedDiffLine
  checked: boolean
  onSelectLine?: (hunkId: string, index: number, extend: boolean) => void
  children: React.ReactNode
}): JSX.Element {
  if (!onSelectLine || line.type === 'context') return <>{children}</>
  const lineNo = line.newLine ?? line.oldLine
  return (
    <span
      className="diff-line-select"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Select ${line.type === 'add' ? 'added' : 'removed'} line ${lineNo}`}
      tabIndex={0}
      title="Click to select this line, Shift-click to select a range"
      onMouseDown={(e) => {
        // Shift-click would otherwise select the text in between.
        if (e.shiftKey) e.preventDefault()
      }}
      onClick={(e) => onSelectLine(hunkId, index, e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onSelectLine(hunkId, index, e.shiftKey)
        }
      }}
    >
      {children}
    </span>
  )
}

function UnifiedDiff({
  hunks,
  lang,
  showWhitespace,
  activeHunkIndex,
  hunkRefs,
  busy,
  actions,
  selection,
  onSelectLine,
  onClearSelection,
  highlightLine,
  laneOf
}: HunkListProps): JSX.Element {
  const highlightRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (highlightLine == null) return
    highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightLine, hunks])

  if (hunks.length === 0) return <div className="diff-empty">No changes.</div>
  return (
    <div className={`diff-unified ${onSelectLine ? 'selectable' : ''}`}>
      {hunks.map((hunk, hi) => {
        const selected = selection?.hunkId === hunk.id ? selection.lines : null
        return (
          <div
            key={hunk.id}
            ref={(el) => {
              hunkRefs.current[hi] = el
            }}
            className={`diff-hunk-block ${hi === activeHunkIndex ? 'active' : ''}`}
          >
            <HunkBar hunk={hunk} busy={busy} actions={actions} selected={selected} onClearSelection={onClearSelection} laneOf={laneOf} />
            {hunk.lines.map((line, li) => {
              const isHighlighted = highlightLine != null && line.newLine === highlightLine
              const checked = selected?.includes(li) ?? false
              const lane = laneProps(laneOf, line)
              return (
                <div
                  key={li}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={`diff-row diff-row-${line.type} ${isHighlighted ? 'diff-row-highlight' : ''} ${checked ? 'diff-row-selected' : ''} ${lane.className}`}
                  style={lane.style}
                >
                  <LineGutter hunkId={hunk.id} index={li} line={line} checked={checked} onSelectLine={onSelectLine}>
                    <span className="gutter-num gutter-old">{line.oldLine ?? ''}</span>
                    <span className="gutter-num gutter-new">{line.newLine ?? ''}</span>
                    <span className="gutter-marker">
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ''}
                    </span>
                  </LineGutter>
                  <span
                    className="line-code"
                    dangerouslySetInnerHTML={{ __html: renderLineHtml(line.text, lang, showWhitespace, line.words) }}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function SplitCell({
  hunkId,
  lines,
  line,
  selected,
  onSelectLine,
  lang,
  showWhitespace,
  side,
  laneOf
}: {
  hunkId: string
  lines: RenderedDiffLine[]
  line: RenderedDiffLine | null
  selected: number[] | null
  onSelectLine?: (hunkId: string, index: number, extend: boolean) => void
  lang: string | null
  showWhitespace: boolean
  side: 'old' | 'new'
  laneOf?: LaneOf
}): JSX.Element {
  const index = line ? lines.indexOf(line) : -1
  const checked = line != null && line.type !== 'context' && (selected?.includes(index) ?? false)
  const num = <span className="gutter-num">{(side === 'old' ? line?.oldLine : line?.newLine) ?? ''}</span>
  const lane = laneProps(laneOf, line)
  return (
    <div className={`diff-split-cell diff-row-${line?.type ?? 'blank'} ${checked ? 'diff-row-selected' : ''} ${lane.className}`} style={lane.style}>
      {line ? (
        <LineGutter hunkId={hunkId} index={index} line={line} checked={checked} onSelectLine={onSelectLine}>
          {num}
        </LineGutter>
      ) : (
        num
      )}
      <span
        className="line-code"
        dangerouslySetInnerHTML={{ __html: line ? renderLineHtml(line.text, lang, showWhitespace, line.words) : '' }}
      />
    </div>
  )
}

function SplitDiff({
  hunks,
  lang,
  showWhitespace,
  activeHunkIndex,
  hunkRefs,
  busy,
  actions,
  selection,
  onSelectLine,
  onClearSelection,
  laneOf
}: HunkListProps): JSX.Element {
  if (hunks.length === 0) return <div className="diff-empty">No changes.</div>
  return (
    <div className={`diff-split ${onSelectLine ? 'selectable' : ''}`}>
      {hunks.map((hunk, hi) => {
        const rows = pairForSplit(hunk.lines)
        const selected = selection?.hunkId === hunk.id ? selection.lines : null
        return (
          <div
            key={hunk.id}
            ref={(el) => {
              hunkRefs.current[hi] = el
            }}
            className={`diff-hunk-block ${hi === activeHunkIndex ? 'active' : ''}`}
          >
            <HunkBar hunk={hunk} busy={busy} actions={actions} selected={selected} onClearSelection={onClearSelection} laneOf={laneOf} />
            <div className="diff-split-rows">
              {rows.map((row, ri) => (
                <div key={ri} className="diff-split-row">
                  {(['old', 'new'] as const).map((side) => (
                    <SplitCell
                      key={side}
                      hunkId={hunk.id}
                      lines={hunk.lines}
                      line={side === 'old' ? row.left : row.right}
                      selected={selected}
                      onSelectLine={onSelectLine}
                      lang={lang}
                      showWhitespace={showWhitespace}
                      side={side}
                      laneOf={laneOf}
                    />
                  ))}
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
  base,
  staged = false,
  untracked = false,
  path,
  oldPath,
  diffText,
  highlightLine,
  onNavigateToCommit,
  onWorkingTreeChanged,
  onEditFile,
  onOpenFileView,
  lanes,
  readOnly = false
}: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('diff')
  const [layout, setLayout] = useState<Layout>('unified')
  const [showWhitespace, setShowWhitespace] = useState(false)
  const [wrapLines, setWrapLines] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  // The whitespace-ignoring diff, for the diff text it was asked for alongside.
  const [wsDiff, setWsDiff] = useState<{ source: string; text: string } | null>(null)
  const plainDiffText = ignoreWhitespace && wsDiff?.source === diffText ? wsDiff.text : diffText

  // The whole file, for the request it answers; anything else means it's still loading.
  const fileRequest = `${repoPath}\0${hash}\0${staged}\0${path}`
  const [file, setFile] = useState<{ request: string; diffText: string; content: string } | null>(null)
  const fileLoaded = file?.request === fileRequest && file.diffText === diffText

  const [activeHunkIndex, setActiveHunkIndex] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [picked, setPicked] = useState<LineSelection | null>(null)
  const [revertStatus, setRevertStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [laneMenu, setLaneMenu] = useState<{ x: number; y: number; hunkId: string; lines: number[] | null } | null>(null)
  const hunkRefs = useRef<Array<HTMLDivElement | null>>([])

  const lang = languageForPath(path)
  const mime = imageMime(path)
  // Images show as pictures; an SVG can switch to its source's text diff.
  const [svgAsText, setSvgAsText] = useState(false)
  const showImage = mime != null && !(mime === 'image/svg+xml' && svgAsText)

  // An LFS file's diff compares pointers; with git-lfs installed it shows what they point to instead.
  const lfs = useContext(LfsContext)
  const lfsPointers = !showImage && isLfsPointerDiff(diffText)
  const [lfsShowPointer, setLfsShowPointer] = useState(false)
  const lfsWantContents = lfsPointers && mode === 'diff' && lfs.info.installed && !lfsShowPointer
  const lfsRequest = `${fileRequest}\0${base}\0${untracked}\0${oldPath}\0${diffText}`
  const [lfsDiff, setLfsDiff] = useState<{ request: string; result: LfsDiff | { error: string } } | null>(null)
  const lfsResult = lfsWantContents && lfsDiff?.request === lfsRequest ? lfsDiff.result : null
  const lfsText = lfsResult && 'kind' in lfsResult && lfsResult.kind === 'text' ? lfsResult.diff : null
  const effectiveDiffText = lfsText ?? plainDiffText

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
    setSvgAsText(false)
    setLfsShowPointer(false)
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
        : base != null
          ? window.api.compareFileDiff(repoPath, base, hash, path, true, oldPath)
          : window.api.commitFileDiff(repoPath, hash, path, true, oldPath)
    request.then((res) => {
      if (cancelled) return
      if (res.ok) setWsDiff({ source: diffText, text: res.data })
    })
    return () => {
      cancelled = true
    }
  }, [ignoreWhitespace, repoPath, hash, base, staged, untracked, path, oldPath, diffText])

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
    if (!lfsWantContents) return
    let cancelled = false
    window.api.lfsDiff(repoPath, { hash, base, staged, untracked, path, oldPath }).then((res) => {
      if (!cancelled) setLfsDiff({ request: lfsRequest, result: res.ok ? res.data : { error: res.error } })
    })
    return () => {
      cancelled = true
    }
  }, [lfsWantContents, lfsRequest, repoPath, hash, base, staged, untracked, path, oldPath])

  useEffect(() => {
    if (!revertStatus) return
    const t = setTimeout(() => setRevertStatus(null), 4000)
    return () => clearTimeout(t)
  }, [revertStatus])

  const hunks = renderFileDiff(effectiveDiffText)
  // A selection only holds for the diff it was made in; a refresh or another file drops it.
  const selection = picked?.diffText === effectiveDiffText ? picked : null

  const gotoHunk = (index: number): void => {
    if (hunks.length === 0) return
    const clamped = (index + hunks.length) % hunks.length
    setActiveHunkIndex(clamped)
    hunkRefs.current[clamped]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const editor = useContext(EditorContext)
  // In the user's code editor when one was found, otherwise whatever the system opens the file with.
  const handleEditInWorkingDir = async (): Promise<void> => {
    if (editor.name) {
      editor.open(path)
      return
    }
    const base = repoPath.replace(/\/+$/, '')
    const res = await window.api.openPath(`${base}/${path}`)
    if (!res.ok) setRevertStatus({ ok: false, message: res.error })
  }

  const runHunkAction = async (action: PartialAction | 'revert', hunkId: string, lines: number[] | null): Promise<void> => {
    setBusy(hunkId)
    setRevertStatus(null)
    const res =
      action === 'revert'
        ? await window.api.revertHunk(repoPath, effectiveDiffText, hunkId)
        : await window.api.applyPartial(repoPath, effectiveDiffText, hunkId, lines, action)
    setBusy(null)
    if (res.ok) {
      setPicked(null)
      if (action === 'revert') setRevertStatus({ ok: true, message: 'Reverted into your working directory.' })
      onWorkingTreeChanged?.()
    } else {
      setRevertStatus({ ok: false, message: res.error })
    }
  }

  const hunkAction = (
    action: PartialAction | 'revert',
    verb: string,
    busyLabel: string,
    icon: string,
    title: string
  ): HunkAction => ({
    verb,
    busyLabel,
    icon,
    title,
    lines: action !== 'revert',
    run: (hunkId, lines) => void runHunkAction(action, hunkId, lines)
  })

  // With lanes on, a change isn't staged but given to a lane: the whole hunk or the picked lines.
  const laneHunkAction: HunkAction = {
    verb: 'Move',
    busyLabel: 'Moving…',
    icon: '⇄',
    title: 'Give this change to another lane',
    lines: !untracked,
    run: (hunkId, lines, at) => setLaneMenu({ ...at, hunkId, lines })
  }
  const laneOf: LaneOf | undefined = lanes
    ? (line) => {
        if (line.type === 'context') return null
        const name = line.type === 'add' ? lanes.ownerOf('+', line.newLine ?? -1) : lanes.ownerOf('-', line.oldLine ?? -1)
        return name ? (lanes.lanes.find((l) => l.name === name) ?? null) : null
      }
    : undefined
  const moveToLane = (lane: string, hunkId: string, picked: number[] | null): void => {
    if (!lanes) return
    const hunk = hunks.find((h) => h.id === hunkId)
    if (!hunk) return
    const lines = untracked
      ? null
      : hunk.lines.flatMap((line, i): { kind: '+' | '-'; line: number }[] => {
          if (picked && !picked.includes(i)) return []
          if (line.type === 'add' && line.newLine != null) return [{ kind: '+', line: line.newLine }]
          if (line.type === 'remove' && line.oldLine != null) return [{ kind: '-', line: line.oldLine }]
          return []
        })
    setPicked(null)
    lanes.onMove(lane, lines)
  }

  // A commit's hunk is undone in the working tree. An uncommitted change can be staged or
  // unstaged a hunk or a few lines at a time, and an unstaged one discarded. A diff that
  // ignores whitespace isn't the file's real change, so it can't be applied, and nor can
  // the diff of what LFS pointers stand for, since git stores the pointers. A comparison only reads.
  const actions: HunkAction[] = lfsWantContents || readOnly || base != null
    ? []
    : hash != null
      ? [hunkAction('revert', 'Revert', 'Reverting…', '↺', 'Revert this change in your working directory')]
      : ignoreWhitespace
        ? []
        : lanes && !staged
          ? [
              ...(untracked
                ? []
                : [hunkAction('discard', 'Discard', 'Discarding…', '↺', 'Throw this change away from your working directory')]),
              laneHunkAction
            ]
          : staged
          ? [hunkAction('unstage', 'Unstage', 'Unstaging…', '−', 'Take this change out of the next commit')]
          : [
              ...(untracked
                ? []
                : [hunkAction('discard', 'Discard', 'Discarding…', '↺', 'Throw this change away from your working directory')]),
              hunkAction('stage', 'Stage', 'Staging…', '+', 'Add this change to the next commit')
            ]
  const canPickLines = hash == null && actions.length > 0

  const selectLine = (hunkId: string, index: number, extend: boolean): void => {
    const hunk = hunks.find((h) => h.id === hunkId)
    if (!hunk) return
    const next = selectDiffLine(selection, hunkId, hunk.lines, index, extend)
    setPicked(next && { ...next, diffText: effectiveDiffText })
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
          <button
            className="icon-button"
            onClick={handleEditInWorkingDir}
            title={editor.name ? `Open in ${editor.name}` : 'Open in external editor'}
            aria-label="Open in external editor"
          >
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
          {mode === 'diff' && mime === 'image/svg+xml' && svgAsText && (
            <button className="text-toggle" onClick={() => setSvgAsText(false)} title="Compare the SVG as pictures">
              Image diff
            </button>
          )}
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
          {mode === 'diff' && !showImage && (
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
          {mode === 'diff' && !showImage && (
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

      {lfsPointers && mode === 'diff' && (
        <div className="lfs-bar" role="group" aria-label="Git LFS">
          <span className="lfs-badge">LFS</span>
          {!lfs.info.installed ? (
            <span className="lfs-bar-note">{LFS_MISSING_NOTE}</span>
          ) : lfsResult && 'error' in lfsResult ? (
            <span className="lfs-bar-note error">Couldn’t load the file from Git LFS: {lfsResult.error}</span>
          ) : (
            <span className="lfs-bar-note">
              {lfsShowPointer ? 'Showing the pointer files git stores.' : 'Showing the files the LFS pointers stand for.'}
            </span>
          )}
          {lfs.info.installed && (
            <div className="toggle-group">
              <button className={!lfsShowPointer ? 'active' : ''} onClick={() => setLfsShowPointer(false)}>
                File contents
              </button>
              <button className={lfsShowPointer ? 'active' : ''} onClick={() => setLfsShowPointer(true)}>
                Pointer
              </button>
            </div>
          )}
        </div>
      )}

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
        ) : lfsWantContents && !lfsResult ? (
          <div className="diff-empty">Loading the file from Git LFS…</div>
        ) : lfsResult && 'kind' in lfsResult && lfsResult.kind === 'binary' ? (
          <div className="diff-empty">
            Binary file stored in Git LFS:{' '}
            {lfsResult.before == null ? 'added' : formatBytes(lfsResult.before)} →{' '}
            {lfsResult.after == null ? 'deleted' : formatBytes(lfsResult.after)}
          </div>
        ) : showImage ? (
          <ImageDiff
            repoPath={repoPath}
            hash={hash}
            base={base}
            staged={staged}
            untracked={untracked}
            path={path}
            oldPath={oldPath}
            diffText={diffText}
            onShowText={mime === 'image/svg+xml' ? () => setSvgAsText(true) : undefined}
          />
        ) : layout === 'unified' ? (
          <UnifiedDiff
            hunks={hunks}
            lang={lang}
            showWhitespace={showWhitespace}
            activeHunkIndex={activeHunkIndex}
            hunkRefs={hunkRefs}
            busy={busy}
            actions={actions}
            selection={selection}
            onSelectLine={canPickLines ? selectLine : undefined}
            onClearSelection={() => setPicked(null)}
            highlightLine={highlightLine}
            laneOf={laneOf}
          />
        ) : (
          <SplitDiff
            hunks={hunks}
            lang={lang}
            showWhitespace={showWhitespace}
            activeHunkIndex={activeHunkIndex}
            hunkRefs={hunkRefs}
            busy={busy}
            actions={actions}
            selection={selection}
            onSelectLine={canPickLines ? selectLine : undefined}
            onClearSelection={() => setPicked(null)}
            laneOf={laneOf}
          />
        )}
      </div>
      {laneMenu && lanes && (
        <ContextMenu
          x={laneMenu.x}
          y={laneMenu.y}
          sections={[
            lanes.lanes.map((l) => ({
              id: `lane-${l.name}`,
              label: `Move to ${l.name}`,
              onSelect: () => moveToLane(l.name, laneMenu.hunkId, laneMenu.lines)
            }))
          ]}
          onClose={() => setLaneMenu(null)}
        />
      )}
    </div>
  )
}
