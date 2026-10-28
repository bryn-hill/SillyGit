import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type JSX } from 'react'
import type { AiHunkResolution, ConflictFileContent, RenameKeep } from '../../../shared/types'
import {
  buildOutput,
  buildOutputLines,
  conflictHunks,
  dropCustomForChangedPicks,
  parseConflictMarkers,
  toggleLine,
  unresolvedCount,
  type ConflictPicks,
  type ConflictSide,
  type CustomResolutions
} from '../../../shared/conflicts'
import { isPrimary, MOD } from '../lib/shortcuts'
import SidePane from './mergeResolver/SidePane'
import WholeFileChoice from './mergeResolver/WholeFileChoice'
import { stripEol } from './mergeResolver/paneRows'

interface Props {
  repoPath: string
  path: string
  onClose: () => void
  /** Called once the file is resolved and staged; `notice` is shown to the user. */
  onResolved: (notice?: string) => void
  onError: (message: string) => void
  /** The configured external merge tool's name, or null when there isn't one. */
  externalToolName: string | null
  onOpenExternal: (path: string) => void
}

export default function MergeResolver({
  repoPath,
  path,
  onClose,
  onResolved,
  onError,
  externalToolName,
  onOpenExternal
}: Props): JSX.Element {
  const [file, setFile] = useState<ConflictFileContent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [picks, setPicks] = useState<ConflictPicks>({})
  // Accepted AI resolutions, and the suggestions still waiting for Accept or Reject.
  const [custom, setCustom] = useState<CustomResolutions>({})
  const [proposals, setProposals] = useState<Record<number, AiHunkResolution>>({})
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  // Manual edits to the output; while set, picks are frozen until Reset.
  const [editedOutput, setEditedOutput] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [askUnresolved, setAskUnresolved] = useState(false)
  const [saving, setSaving] = useState(false)
  const paneA = useRef<HTMLDivElement>(null)
  const paneB = useRef<HTMLDivElement>(null)
  const output = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const segments = useMemo(() => (file?.kind === 'text' ? parseConflictMarkers(file.marked, file.markerSize) : []), [file])
  const hunks = useMemo(() => conflictHunks(segments), [segments])
  const unresolved = unresolvedCount(segments, picks, custom)
  const proposalLines = useMemo(
    () => Object.fromEntries(Object.values(proposals).map((p) => [p.hunkId, p.lines])) as CustomResolutions,
    [proposals]
  )
  const outputLines = useMemo(
    () => buildOutputLines(segments, picks, { custom, proposals: proposalLines, headers: true }),
    [segments, picks, custom, proposalLines]
  )
  const pendingProposals = Object.values(proposals)
  const changed =
    editedOutput !== null ||
    Object.values(picks).some((p) => p.length > 0) ||
    Object.keys(custom).length > 0 ||
    pendingProposals.length > 0
  const hunkNumber = useMemo(() => new Map(hunks.map((h, i) => [h.id, i + 1])), [hunks])

  // Picking lines in a hunk takes over from its accepted AI resolution.
  const changePicks = (next: ConflictPicks): void => {
    setCustom((c) => dropCustomForChangedPicks(c, picks, next))
    setProposals((p) => {
      const rest = { ...p }
      for (const id of Object.keys(rest)) if ((next[Number(id)] ?? []).length > 0) delete rest[Number(id)]
      return rest
    })
    setPicks(next)
  }

  const acceptProposals = (ids: number[]): void => {
    setCustom((c) => {
      const next = { ...c }
      for (const id of ids) if (proposals[id]) next[id] = proposals[id].lines
      return next
    })
    setPicks((p) => {
      const next = { ...p }
      for (const id of ids) delete next[id]
      return next
    })
    rejectProposals(ids)
  }

  const rejectProposals = (ids: number[]): void => {
    setProposals((p) => {
      const rest = { ...p }
      for (const id of ids) delete rest[id]
      return rest
    })
  }

  const undoCustom = (id: number): void => {
    setCustom((c) => {
      const rest = { ...c }
      delete rest[id]
      return rest
    })
  }

  const autoResolve = async (): Promise<void> => {
    if (aiBusy) return
    setAiBusy(true)
    setAiSummary(null)
    const res = await window.api.aiResolveConflicts(repoPath, path)
    setAiBusy(false)
    if (!res.ok) {
      onError(res.error)
      return
    }
    if (res.data.hunkCount !== hunks.length) {
      onError('The file changed while Claude was looking at it. Close the merge tool and open it again.')
      return
    }
    // Hunks already resolved by hand keep the user's choice.
    const open = res.data.resolutions.filter((r) => !(r.hunkId in custom) && !(picks[r.hunkId]?.length > 0))
    setProposals(Object.fromEntries(open.map((r) => [r.hunkId, r])))
    const skipped = res.data.resolutions.length - open.length
    const missing = hunks.length - res.data.resolutions.length
    const notes = [
      res.data.summary,
      skipped > 0 ? `${skipped} conflict${skipped === 1 ? '' : 's'} you already resolved were left alone.` : null,
      missing > 0 ? `No suggestion for ${missing} conflict${missing === 1 ? '' : 's'}.` : null
    ].filter(Boolean)
    setAiSummary(notes.join(' ') || null)
  }

  const save = useCallback(
    async (content: string, notice?: string, stage = true) => {
      setSaving(true)
      const res = await window.api.saveResolution(repoPath, path, content, stage)
      setSaving(false)
      if (res.ok) onResolved(notice)
      else onError(res.error)
    },
    [repoPath, path, onResolved, onError]
  )

  const autoSave = useEffectEvent((content: string) => save(content, 'Merge tool automatically resolved your conflict'))

  // The parent keys this by file, so it starts from fresh state for each one.
  useEffect(() => {
    let cancelled = false
    window.api.conflictFile(repoPath, path).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setLoadError(res.error)
        return
      }
      // When the 3-way merge comes out clean, there is nothing to pick.
      if (res.data.kind === 'text' && conflictHunks(parseConflictMarkers(res.data.marked, res.data.markerSize)).length === 0) {
        autoSave(res.data.marked)
        return
      }
      setFile(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, path])

  const scrollToHunk = (index: number): void => {
    const hunk = hunks[index]
    if (!hunk) return
    setCurrent(index)
    for (const pane of [paneA.current, paneB.current, output.current]) {
      const target = pane?.querySelector<HTMLElement>(`[data-hunk="${hunk.id}"]`)
      if (pane && target) pane.scrollTop = target.offsetTop - pane.offsetTop - 24
    }
  }

  // A and B have the same rows, so they scroll together.
  const syncScroll = (from: React.RefObject<HTMLDivElement | null>): void => {
    if (syncing.current) return
    const to = from === paneA ? paneB : paneA
    if (!from.current || !to.current) return
    syncing.current = true
    to.current.scrollTop = from.current.scrollTop
    to.current.scrollLeft = from.current.scrollLeft
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }

  const requestSave = (): void => {
    if (!file || file.kind !== 'text' || saving) return
    if (editedOutput !== null) save(editedOutput)
    else if (unresolved > 0) setAskUnresolved(true)
    else save(buildOutput(segments, picks, { custom }))
  }

  const reset = (): void => {
    setPicks({})
    setCustom({})
    setProposals({})
    setAiSummary(null)
    setEditedOutput(null)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        requestSave()
      } else if (isPrimary(e) && e.key.toLowerCase() === 'd' && externalToolName) {
        e.preventDefault()
        onOpenExternal(path)
      } else if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        if (askUnresolved) setAskUnresolved(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const takeWhole = async (side: 'current' | 'incoming' | 'base'): Promise<void> => {
    const res = await window.api.takeSide(repoPath, path, side)
    if (res.ok) onResolved()
    else onError(res.error)
  }

  const deleteFile = async (): Promise<void> => {
    const res = await window.api.deleteConflictedFile(repoPath, path)
    if (res.ok) onResolved()
    else onError(res.error)
  }

  const resolveRename = async (keep: RenameKeep): Promise<void> => {
    const res = await window.api.resolveRename(repoPath, path, keep)
    if (res.ok) onResolved()
    else onError(res.error)
  }

  const keepAsIs = async (): Promise<void> => {
    const res = await window.api.markResolved(repoPath, [path])
    if (res.ok) onResolved()
    else onError(res.error)
  }

  const header = (
    <div className="merge-toolbar">
      <span className="operation-warning" aria-hidden="true">
        ⚠
      </span>
      <span className="merge-title">{path}</span>
      {file?.kind === 'text' && (
        <span className="merge-dim">
          ({hunks.length} conflict{hunks.length === 1 ? '' : 's'})
        </span>
      )}
      <span className="merge-toolbar-spacer" />
      {file?.kind === 'text' && hunks.length > 0 && (
        <button
          className="merge-ai-button"
          disabled={aiBusy || editedOutput !== null}
          onClick={() => void autoResolve()}
          title="Ask Claude to suggest a resolution for each conflict; you accept or reject each one"
        >
          {aiBusy ? 'Asking Claude…' : '✨ Auto-resolve with AI'}
        </button>
      )}
      {externalToolName && file && (file.kind === 'text' || file.kind === 'binary') && (
        <button onClick={() => onOpenExternal(path)} title={`Open in ${externalToolName} (${MOD}D)`}>
          Open in {externalToolName} ↗
        </button>
      )}
      {file?.kind === 'text' && (
        <button className="merge-save-button" disabled={saving} onClick={requestSave} title="Save and mark resolved (Ctrl+S)">
          Save
        </button>
      )}
      <button className="icon-button" title="Close merge tool (Esc)" onClick={onClose}>
        ✕
      </button>
    </div>
  )

  return (
    <div className="merge-resolver" role="region" aria-label="Merge tool">
      {header}
      {loadError && <div className="commit-fullview-empty">{loadError}</div>}
      {!file && !loadError && <div className="commit-fullview-empty">Loading diff…</div>}
      {file && file.kind !== 'text' && (
        <WholeFileChoice
          file={file}
          onTake={takeWhole}
          onDelete={deleteFile}
          onResolveRename={resolveRename}
          onKeepAsIs={keepAsIs}
          onClose={onClose}
        />
      )}
      {file?.kind === 'text' && (
        <>
          <div className="merge-sides">
            <SidePane
              side="ours"
              label={file.currentLabel}
              segments={segments}
              picks={picks}
              locked={editedOutput !== null}
              onPicksChange={changePicks}
              paneRef={paneA}
              onScroll={() => syncScroll(paneA)}
            />
            <SidePane
              side="theirs"
              label={file.incomingLabel}
              segments={segments}
              picks={picks}
              locked={editedOutput !== null}
              onPicksChange={changePicks}
              paneRef={paneB}
              onScroll={() => syncScroll(paneB)}
            />
          </div>
          <section className="merge-output" aria-label="Output">
            {aiSummary && (
              <div className="merge-ai-summary" role="status" aria-label="AI merge summary">
                ✨ {aiSummary}
              </div>
            )}
            <header className="merge-pane-header">
              <span className="merge-output-title">Output</span>
              <span className="merge-dim" data-testid="conflict-position">
                conflict {Math.min(current + 1, hunks.length)} of {hunks.length}
              </span>
              <button
                className="icon-button"
                title="Previous conflict"
                disabled={current <= 0}
                onClick={() => scrollToHunk(current - 1)}
              >
                ▲
              </button>
              <button
                className="icon-button"
                title="Next conflict"
                disabled={current >= hunks.length - 1}
                onClick={() => scrollToHunk(current + 1)}
              >
                ▼
              </button>
              {unresolved > 0 && editedOutput === null && (
                <span className="merge-unresolved">{unresolved} unresolved</span>
              )}
              {pendingProposals.length > 0 && (
                <>
                  <button className="merge-save-button" onClick={() => acceptProposals(pendingProposals.map((p) => p.hunkId))}>
                    Accept all AI suggestions ({pendingProposals.length})
                  </button>
                  <button onClick={() => rejectProposals(pendingProposals.map((p) => p.hunkId))}>Reject all</button>
                </>
              )}
              <span className="merge-toolbar-spacer" />
              {editedOutput === null && (
                <button className="link-button" onClick={() => setEditedOutput(buildOutput(segments, picks, { custom }))}>
                  Edit output
                </button>
              )}
              {changed && (
                <button className="link-button" onClick={reset}>
                  Reset
                </button>
              )}
            </header>
            {editedOutput !== null ? (
              <textarea
                className="merge-output-editor"
                aria-label="Output text"
                spellCheck={false}
                value={editedOutput}
                onChange={(e) => setEditedOutput(e.target.value)}
              />
            ) : (
              <div className="merge-pane-body" ref={output} data-testid="merge-output">
                {(() => {
                  let lineNo = 0
                  return outputLines.map((line, i) => {
                    const firstOfHunk =
                      line.hunkId !== undefined && (i === 0 || outputLines[i - 1].hunkId !== line.hunkId)
                    const dataHunk = firstOfHunk ? line.hunkId : undefined
                    if (line.origin === 'proposal-header') {
                      const p = proposals[line.hunkId!]
                      return (
                        <div
                          key={i}
                          className={`merge-ai-header confidence-${p.confidence}`}
                          data-hunk={dataHunk}
                          role="group"
                          aria-label={`AI suggestion for conflict ${hunkNumber.get(p.hunkId)}`}
                        >
                          <span className="merge-ai-badge">✨ Conflict {hunkNumber.get(p.hunkId)}</span>
                          <span className="merge-ai-confidence">{p.confidence} confidence</span>
                          <span className="merge-ai-explanation">
                            {p.lines.length === 0 ? '(removes the conflicting lines) ' : ''}
                            {p.explanation}
                          </span>
                          <button className="merge-save-button" onClick={() => acceptProposals([p.hunkId])}>
                            Accept
                          </button>
                          <button onClick={() => rejectProposals([p.hunkId])}>Reject</button>
                        </div>
                      )
                    }
                    if (line.origin === 'custom-header') {
                      return (
                        <div key={i} className="merge-ai-header accepted" data-hunk={dataHunk}>
                          <span className="merge-ai-badge">✨ Conflict {hunkNumber.get(line.hunkId!)}</span>
                          <span className="merge-ai-explanation">AI resolution accepted</span>
                          <button
                            className="link-button"
                            aria-label={`Undo AI resolution of conflict ${hunkNumber.get(line.hunkId!)}`}
                            onClick={() => undoCustom(line.hunkId!)}
                          >
                            Undo
                          </button>
                        </div>
                      )
                    }
                    lineNo++
                    const fromSide = line.origin === 'ours' || line.origin === 'theirs'
                    return (
                      <div key={i} className={`merge-line output-${line.origin}`} data-hunk={dataHunk}>
                        {fromSide ? (
                          <button
                            className="merge-line-button"
                            title="Remove this line"
                            aria-label={`Remove line ${lineNo} from output`}
                            onClick={() =>
                              changePicks(toggleLine(picks, line.hunkId!, line.origin as ConflictSide, line.index!))
                            }
                          >
                            ⊖
                          </button>
                        ) : (
                          <span className="merge-gutter" />
                        )}
                        <span className="merge-lineno">{lineNo}</span>
                        <span className="merge-text">{stripEol(line.text)}</span>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </section>
        </>
      )}
      {askUnresolved && file?.kind === 'text' && (
        <div className="modal-backdrop">
          <div className="merge-choice" role="alertdialog" aria-label="Unresolved conflicts">
            <p>You have unresolved conflicts. How would you like to proceed?</p>
            <div className="merge-choice-buttons">
              <button
                className="merge-save-button"
                onClick={() => {
                  setAskUnresolved(false)
                  save(buildOutput(segments, picks, { custom }))
                }}
              >
                Save Output
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  setAskUnresolved(false)
                  save(
                    buildOutput(segments, picks, {
                      custom,
                      unresolved: 'markers',
                      currentLabel: file.currentLabel,
                      incomingLabel: file.incomingLabel,
                      markerSize: file.markerSize
                    }),
                    'Saved with conflict markers; the file is still listed as conflicted',
                    false
                  )
                }}
              >
                Create Conflict Chunks
              </button>
              <button onClick={() => setAskUnresolved(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
