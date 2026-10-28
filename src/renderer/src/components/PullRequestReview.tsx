import { Fragment, useCallback, useEffect, useMemo, useState, type JSX, type MouseEvent } from 'react'
import {
  checksSummary,
  REVIEW_EVENT_LABELS,
  reviewProblem,
  threadsByLine,
  type DiffSide,
  type DraftReviewComment,
  type PrCheck,
  type PrFile,
  type PrReviewThread,
  type PullRequestDetail,
  type ReviewEvent
} from '../../../shared/prReview'
import { renderFileDiff, type RenderedDiffLine } from '../lib/diffRender'
import { highlightLine, languageForPath } from '../lib/highlight'
import { timeAgo } from '../lib/timeAgo'
import Avatar from './Avatar'

interface Props {
  repoPath: string
  number: number
  /** Shown while the pull request loads. */
  title: string
  onBack: () => void
}

type Tab = 'conversation' | 'files'

interface Composer {
  path: string
  side: DiffSide
  line: number
  startLine?: number
}

// Unsent line comments and the review summary outlive leaving the screen (until the app quits).
const draftsByPr = new Map<string, { comments: DraftReviewComment[]; body: string; event: ReviewEvent }>()

const REVIEW_EVENTS: ReviewEvent[] = ['COMMENT', 'APPROVE', 'REQUEST_CHANGES']

/** Which side and line a diff row is commented on: removed lines on the old side, the rest on the new. */
function rowAnchor(line: RenderedDiffLine): { side: DiffSide; line: number } {
  return line.type === 'remove' ? { side: 'LEFT', line: line.oldLine! } : { side: 'RIGHT', line: line.newLine! }
}

function checkIcon(state: PrCheck['state']): string {
  switch (state) {
    case 'success':
      return '✓'
    case 'failure':
      return '✕'
    case 'pending':
      return '●'
    default:
      return '–'
  }
}

const REVIEW_STATE_TEXT: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'reviewed',
  DISMISSED: 'reviewed (dismissed)'
}

function Body({ text }: { text: string }): JSX.Element {
  return text.trim() ? <div className="pr-body-text">{text}</div> : <div className="pr-body-empty">No description.</div>
}

function CommentBox({
  placeholder,
  submitLabel,
  initial = '',
  autoFocus,
  onSubmit,
  onCancel
}: {
  placeholder: string
  submitLabel: string
  initial?: string
  autoFocus?: boolean
  onSubmit: (body: string) => Promise<boolean> | boolean
  onCancel?: () => void
}): JSX.Element {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    if (!text.trim()) return
    setBusy(true)
    const done = await onSubmit(text)
    setBusy(false)
    if (done) setText('')
  }
  return (
    <div className="pr-comment-box">
      <textarea
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
      />
      <div className="pr-comment-box-actions">
        {onCancel && (
          <button className="subtle" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="pr-primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
          {busy ? 'Sending…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

function CommentView({ author, createdAt, body }: { author: string; createdAt: string; body: string }): JSX.Element {
  return (
    <div className="pr-comment">
      <div className="pr-comment-head">
        <Avatar name={author} size={18} />
        <span className="pr-comment-author">{author}</span>
        <span className="pr-comment-time">{createdAt ? timeAgo(createdAt) : ''}</span>
      </div>
      <div className="pr-body-text">{body}</div>
    </div>
  )
}

function ThreadView({
  thread,
  onReply,
  onResolve
}: {
  thread: PrReviewThread
  onReply: (thread: PrReviewThread, body: string) => Promise<boolean>
  onResolve: (thread: PrReviewThread, resolved: boolean) => void
}): JSX.Element {
  const [open, setOpen] = useState(!thread.isResolved)
  const [replying, setReplying] = useState(false)
  return (
    <div className={`pr-thread ${thread.isResolved ? 'resolved' : ''}`} data-testid="pr-thread">
      <div className="pr-thread-head">
        <button className="link-button" onClick={() => setOpen((v) => !v)}>
          {open ? '▾' : '▸'} {thread.comments[0]?.author ?? 'Thread'}
          {thread.comments.length > 1 ? ` and ${thread.comments.length - 1} more` : ''}
        </button>
        {thread.isResolved && <span className="pr-tag">Resolved</span>}
        {thread.isOutdated && <span className="pr-tag">Outdated</span>}
        <span className="pr-thread-spacer" />
        <button className="subtle" onClick={() => onResolve(thread, !thread.isResolved)}>
          {thread.isResolved ? 'Unresolve' : 'Resolve'}
        </button>
      </div>
      {open && (
        <>
          {thread.isOutdated && thread.diffHunk && <pre className="pr-thread-hunk">{thread.diffHunk}</pre>}
          {thread.comments.map((c) => (
            <CommentView key={c.id} {...c} />
          ))}
          {replying ? (
            <CommentBox
              placeholder="Reply…"
              submitLabel="Reply"
              autoFocus
              onSubmit={async (body) => {
                const ok = await onReply(thread, body)
                if (ok) setReplying(false)
                return ok
              }}
              onCancel={() => setReplying(false)}
            />
          ) : (
            <button className="pr-reply-button" onClick={() => setReplying(true)}>
              Reply…
            </button>
          )}
        </>
      )}
    </div>
  )
}

function DraftView({
  draft,
  onEdit,
  onDelete
}: {
  draft: DraftReviewComment
  onEdit: (body: string) => void
  onDelete: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <div className="pr-thread pr-draft">
        <CommentBox
          placeholder="Leave a comment"
          submitLabel="Update comment"
          initial={draft.body}
          autoFocus
          onSubmit={(body) => {
            onEdit(body)
            setEditing(false)
            return true
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  return (
    <div className="pr-thread pr-draft" data-testid="pr-draft">
      <div className="pr-thread-head">
        <span className="pr-tag pr-tag-pending">Pending</span>
        {draft.startLine != null && draft.startLine < draft.line && (
          <span className="pr-comment-time">
            lines {draft.startLine}–{draft.line}
          </span>
        )}
        <span className="pr-thread-spacer" />
        <button className="subtle" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button className="subtle" onClick={onDelete}>
          Delete
        </button>
      </div>
      <div className="pr-body-text">{draft.body}</div>
    </div>
  )
}

function FileDiff({
  file,
  threads,
  drafts,
  composer,
  onStartComment,
  onAddDraft,
  onCancelComment,
  onEditDraft,
  onDeleteDraft,
  onReply,
  onResolve
}: {
  file: PrFile
  threads: PrReviewThread[]
  drafts: DraftReviewComment[]
  composer: Composer | null
  onStartComment: (anchor: Composer, extend: boolean) => void
  onAddDraft: (body: string) => void
  onCancelComment: () => void
  onEditDraft: (id: string, body: string) => void
  onDeleteDraft: (id: string) => void
  onReply: (thread: PrReviewThread, body: string) => Promise<boolean>
  onResolve: (thread: PrReviewThread, resolved: boolean) => void
}): JSX.Element {
  const lang = languageForPath(file.path)
  const hunks = useMemo(
    () => (file.patch ? renderFileDiff(`diff --git a/${file.path} b/${file.path}\n${file.patch}\n`) : []),
    [file.path, file.patch]
  )
  const { byLine, outdated } = useMemo(() => threadsByLine(threads, file.path), [threads, file.path])
  const draftsAt = (side: DiffSide, line: number): DraftReviewComment[] =>
    drafts.filter((d) => d.path === file.path && d.side === side && d.line === line)
  const inComposerRange = (side: DiffSide, line: number): boolean =>
    !!composer &&
    composer.path === file.path &&
    composer.side === side &&
    line <= composer.line &&
    line >= (composer.startLine ?? composer.line)

  const threadProps = { onReply, onResolve }

  return (
    <div className="pr-file-diff" data-testid="pr-file-diff">
      <div className="pr-file-diff-header">
        <span className="pr-file-diff-path">
          {file.previousPath ? `${file.previousPath} → ` : ''}
          {file.path}
        </span>
        <span className="launchpad-stat-add">+{file.additions}</span>
        <span className="launchpad-stat-del">-{file.deletions}</span>
      </div>
      {outdated.length > 0 && (
        <div className="pr-outdated">
          {outdated.map((t) => (
            <ThreadView key={t.id} thread={t} {...threadProps} />
          ))}
        </div>
      )}
      {hunks.length === 0 ? (
        <div className="diff-empty">
          {file.patch == null ? 'GitHub has no diff for this file (binary or too large).' : 'No changes.'}
        </div>
      ) : (
        <div className="diff-unified pr-diff">
          {hunks.map((hunk) => (
            <div key={hunk.id} className="diff-hunk-block">
              <div className="diff-hunk-bar">
                <span className="diff-hunk-header-text">{hunk.header}</span>
              </div>
              {hunk.lines.map((line, li) => {
                const anchor = rowAnchor(line)
                const here = [...(byLine.get(`${anchor.side}:${anchor.line}`) ?? [])]
                // A comment on an unchanged line may sit on either side.
                if (line.type === 'context') here.push(...(byLine.get(`LEFT:${line.oldLine}`) ?? []))
                const pending = draftsAt(anchor.side, anchor.line)
                const composing =
                  composer?.path === file.path && composer.side === anchor.side && composer.line === anchor.line
                return (
                  <Fragment key={li}>
                    <div
                      className={`diff-row diff-row-${line.type} ${inComposerRange(anchor.side, anchor.line) ? 'pr-row-selected' : ''}`}
                      data-testid="pr-diff-row"
                      data-side={anchor.side}
                      data-line={anchor.line}
                    >
                      <span className="gutter-num gutter-old">{line.oldLine ?? ''}</span>
                      <span className="gutter-num gutter-new">{line.newLine ?? ''}</span>
                      <button
                        className="pr-add-comment"
                        title="Comment on this line (Shift-click to comment on a range)"
                        aria-label={`Comment on line ${anchor.line}`}
                        onClick={(e: MouseEvent) => onStartComment({ path: file.path, ...anchor }, e.shiftKey)}
                      >
                        +
                      </button>
                      <span className="gutter-marker">
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                      </span>
                      <span
                        className="line-code"
                        dangerouslySetInnerHTML={{ __html: highlightLine(line.text, lang) || ' ' }}
                      />
                    </div>
                    {(here.length > 0 || pending.length > 0 || composing) && (
                      <div className="pr-inline">
                        {here.map((t) => (
                          <ThreadView key={t.id} thread={t} {...threadProps} />
                        ))}
                        {pending.map((d) => (
                          <DraftView
                            key={d.id}
                            draft={d}
                            onEdit={(body) => onEditDraft(d.id, body)}
                            onDelete={() => onDeleteDraft(d.id)}
                          />
                        ))}
                        {composing && (
                          <div className="pr-thread pr-draft">
                            <CommentBox
                              placeholder={
                                composer.startLine != null && composer.startLine < composer.line
                                  ? `Comment on lines ${composer.startLine}–${composer.line}`
                                  : 'Leave a comment'
                              }
                              submitLabel="Add review comment"
                              autoFocus
                              onSubmit={(body) => {
                                onAddDraft(body)
                                return true
                              }}
                              onCancel={onCancelComment}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PullRequestReview({ repoPath, number, title, onBack }: Props): JSX.Element {
  const key = `${repoPath}#${number}`
  const saved = draftsByPr.get(key)
  const [detail, setDetail] = useState<PullRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('conversation')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [composer, setComposer] = useState<Composer | null>(null)
  const [drafts, setDrafts] = useState<DraftReviewComment[]>(saved?.comments ?? [])
  const [reviewBody, setReviewBody] = useState(saved?.body ?? '')
  const [event, setEvent] = useState<ReviewEvent>(saved?.event ?? 'COMMENT')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    draftsByPr.set(key, { comments: drafts, body: reviewBody, event })
  }, [key, drafts, reviewBody, event])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.api.prGetDetail(repoPath, number)
    setLoading(false)
    if (res.ok) {
      setDetail(res.data)
      setError(null)
    } else setError(res.error)
  }, [repoPath, number])

  useEffect(() => {
    void load()
  }, [load])

  const isOwn = !!detail && detail.author === detail.viewer
  useEffect(() => {
    if (isOwn && event !== 'COMMENT') setEvent('COMMENT')
  }, [isOwn, event])

  const files = detail?.files ?? []
  const currentFile = files.find((f) => f.path === filePath) ?? files[0]
  const unresolved = detail?.threads.filter((t) => !t.isResolved).length ?? 0

  /** Runs a write to GitHub, then reloads so the screen shows what GitHub now has. */
  const act = async (run: () => ReturnType<typeof window.api.prAddComment>, done?: string): Promise<boolean> => {
    setActionError(null)
    const res = await run()
    if (!res.ok) {
      setActionError(res.error)
      return false
    }
    if (done) setNotice(done)
    await load()
    return true
  }

  const onReply = (thread: PrReviewThread, body: string): Promise<boolean> =>
    act(() => window.api.prReplyToThread(repoPath, thread.id, body))
  const onResolve = (thread: PrReviewThread, resolved: boolean): void =>
    void act(() => window.api.prSetThreadResolved(repoPath, thread.id, resolved))

  const startComment = (anchor: Composer, extend: boolean): void => {
    if (extend && composer && composer.path === anchor.path && composer.side === anchor.side) {
      const lines = [composer.startLine ?? composer.line, composer.line, anchor.line]
      setComposer({ ...anchor, line: Math.max(...lines), startLine: Math.min(...lines) })
    } else setComposer(anchor)
  }

  const addDraft = (body: string): void => {
    if (!composer) return
    setDrafts((d) => [...d, { id: `draft-${Date.now()}-${d.length}`, ...composer, body }])
    setComposer(null)
  }

  const problem = reviewProblem({ event, body: reviewBody, comments: drafts }, isOwn)

  const submitReview = async (): Promise<void> => {
    if (!detail || problem) return
    setSubmitting(true)
    const ok = await act(
      () => window.api.prSubmitReview(repoPath, number, { headSha: detail.headSha, event, body: reviewBody, comments: drafts }),
      `Review sent: ${REVIEW_EVENT_LABELS[event]}${drafts.length ? ` with ${drafts.length} line comment${drafts.length > 1 ? 's' : ''}` : ''}.`
    )
    setSubmitting(false)
    if (ok) {
      setDrafts([])
      setReviewBody('')
      setEvent('COMMENT')
    }
  }

  const commentCount = (path: string): number =>
    (detail?.threads.filter((t) => t.path === path).length ?? 0) + drafts.filter((d) => d.path === path).length

  const timeline = detail
    ? [
        ...detail.reviews
          .filter((r) => r.body.trim() || r.state !== 'COMMENTED')
          .map((r) => ({ kind: 'review' as const, at: r.submittedAt, review: r })),
        ...detail.comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, comment: c }))
      ].sort((a, b) => a.at.localeCompare(b.at))
    : []

  const checks = detail ? checksSummary(detail.checks) : null

  return (
    <div className="launchpad pr-review" data-testid="pr-review">
      <div className="launchpad-header">
        <button className="icon-button" onClick={onBack} title="Back to Launchpad" aria-label="Back to Launchpad">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="launchpad-title pr-review-title">
          <span className="pr-review-title-text">
            {detail?.title ?? title} <span className="pr-number">#{number}</span>
          </span>
          {detail && (
            <span className="launchpad-subtitle">
              {detail.author} wants to merge {detail.headRefName} into {detail.baseRefName} ·{' '}
              <span className="launchpad-stat-add">+{detail.additions}</span>{' '}
              <span className="launchpad-stat-del">-{detail.deletions}</span>
            </span>
          )}
        </div>
        {detail && (
          <span className={`pr-state pr-state-${detail.isDraft ? 'draft' : detail.state.toLowerCase()}`}>
            {detail.isDraft ? 'Draft' : detail.state.charAt(0) + detail.state.slice(1).toLowerCase()}
          </span>
        )}
        <button className="subtle" onClick={() => detail && window.api.openExternal(detail.url)} disabled={!detail}>
          Open on GitHub
        </button>
        <button className="subtle" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && !detail && (
        <div className="launchpad-body">
          <div className="launchpad-notice">
            <p>Couldn't load pull request #{number}.</p>
            <p className="launchpad-notice-hint">{error}</p>
          </div>
        </div>
      )}
      {!detail && !error && (
        <div className="launchpad-body">
          <div className="launchpad-notice">Loading…</div>
        </div>
      )}

      {detail && (
        <>
          <div className="pr-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'conversation'} className={tab === 'conversation' ? 'active' : ''} onClick={() => setTab('conversation')}>
              Conversation
            </button>
            <button role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
              Files changed <span className="launchpad-bucket-count">{files.length}</span>
            </button>
            {unresolved > 0 && <span className="pr-tabs-note">{unresolved} unresolved conversation{unresolved > 1 ? 's' : ''}</span>}
          </div>

          {(actionError || notice) && (
            <div className={`pr-banner ${actionError ? 'error' : ''}`} role="status">
              <span>{actionError ?? notice}</span>
              <button className="link-button" onClick={() => (setActionError(null), setNotice(null))}>
                Dismiss
              </button>
            </div>
          )}

          {tab === 'conversation' ? (
            <div className="launchpad-body pr-conversation">
              <div className="pr-card">
                <CommentView author={detail.author} createdAt={detail.createdAt} body={''} />
                <Body text={detail.body} />
              </div>

              <div className="pr-card" data-testid="pr-checks">
                <div className={`pr-checks-summary pr-check-${checks!.state}`}>
                  {checkIcon(checks!.state)} {checks!.text}
                </div>
                {detail.checks.map((c) => (
                  <div key={c.name} className={`pr-check pr-check-${c.state}`}>
                    <span className="pr-check-icon">{checkIcon(c.state)}</span>
                    <span className="pr-check-name">{c.name}</span>
                    {c.description && <span className="pr-check-desc">{c.description}</span>}
                    {c.url?.startsWith('https://') && (
                      <button className="link-button" onClick={() => window.api.openExternal(c.url!)}>
                        Details
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {timeline.map((item) =>
                item.kind === 'review' ? (
                  <div key={item.review.id} className={`pr-card pr-review-event pr-review-${item.review.state.toLowerCase()}`}>
                    <div className="pr-comment-head">
                      <Avatar name={item.review.author} size={18} />
                      <span className="pr-comment-author">{item.review.author}</span>
                      <span>{REVIEW_STATE_TEXT[item.review.state] ?? 'reviewed'}</span>
                      <span className="pr-comment-time">{item.review.submittedAt ? timeAgo(item.review.submittedAt) : ''}</span>
                    </div>
                    {item.review.body.trim() && <div className="pr-body-text">{item.review.body}</div>}
                  </div>
                ) : (
                  <div key={item.comment.id} className="pr-card">
                    <CommentView {...item.comment} />
                  </div>
                )
              )}

              {detail.threads.length > 0 && (
                <div className="pr-card">
                  <button className="link-button" onClick={() => setTab('files')}>
                    {detail.threads.length} line conversation{detail.threads.length > 1 ? 's' : ''} ({unresolved} unresolved) in
                    Files changed
                  </button>
                </div>
              )}

              <div className="pr-card">
                <CommentBox
                  placeholder="Add a comment to the conversation"
                  submitLabel="Comment"
                  onSubmit={(body) => act(() => window.api.prAddComment(repoPath, number, body), 'Comment added.')}
                />
              </div>
            </div>
          ) : (
            <div className="pr-files">
              <div className="pr-file-list" role="listbox" aria-label="Changed files">
                {files.map((f) => {
                  const count = commentCount(f.path)
                  return (
                    <div
                      key={f.path}
                      role="option"
                      aria-selected={f === currentFile}
                      className={`pr-file-item ${f === currentFile ? 'active' : ''}`}
                      title={f.path}
                      onClick={() => {
                        setFilePath(f.path)
                        setComposer(null)
                      }}
                    >
                      <span className={`pr-file-status pr-file-${f.status}`}>{f.status.charAt(0).toUpperCase()}</span>
                      <span className="pr-file-name">{f.path}</span>
                      {count > 0 && <span className="pr-file-comments">{count}</span>}
                    </div>
                  )
                })}
              </div>
              <div className="pr-file-pane">
                {currentFile ? (
                  <FileDiff
                    file={currentFile}
                    threads={detail.threads}
                    drafts={drafts}
                    composer={composer}
                    onStartComment={startComment}
                    onAddDraft={addDraft}
                    onCancelComment={() => setComposer(null)}
                    onEditDraft={(id, body) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, body } : x)))}
                    onDeleteDraft={(id) => setDrafts((d) => d.filter((x) => x.id !== id))}
                    onReply={onReply}
                    onResolve={onResolve}
                  />
                ) : (
                  <div className="diff-empty">No files changed.</div>
                )}
              </div>
            </div>
          )}

          {detail.state === 'OPEN' && (
            <div className="pr-review-bar" data-testid="pr-review-bar">
              <textarea
                value={reviewBody}
                rows={2}
                placeholder="Review summary (optional)"
                aria-label="Review summary"
                onChange={(e) => setReviewBody(e.target.value)}
              />
              <div className="pr-review-bar-actions">
                <div className="toggle-group" role="radiogroup" aria-label="Review verdict">
                  {REVIEW_EVENTS.map((ev) => (
                    <button
                      key={ev}
                      role="radio"
                      aria-checked={event === ev}
                      className={event === ev ? 'active' : ''}
                      disabled={isOwn && ev !== 'COMMENT'}
                      title={isOwn && ev !== 'COMMENT' ? "You can't approve or request changes on your own pull request." : undefined}
                      onClick={() => setEvent(ev)}
                    >
                      {REVIEW_EVENT_LABELS[ev]}
                    </button>
                  ))}
                </div>
                <span className="pr-review-bar-hint">{problem ?? ''}</span>
                <button className="pr-primary" disabled={!!problem || submitting} onClick={() => void submitReview()}>
                  {submitting ? 'Sending…' : `Submit review${drafts.length ? ` (${drafts.length} pending)` : ''}`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
