import { useEffect, useEffectEvent, useState, type JSX } from 'react'
import {
  checksSummary,
  REVIEW_EVENT_LABELS,
  reviewProblem,
  type DraftReviewComment,
  type PrCheck,
  type PrReviewThread,
  type PullRequestDetail,
  type ReviewEvent
} from '../../../shared/prReview'
import { timeAgo } from '../lib/timeAgo'
import Avatar from './Avatar'
import FileDiff, { type Composer } from './prReview/FileDiff'
import { Body, CommentBox, CommentView } from './prReview/comments'

interface Props {
  repoPath: string
  number: number
  /** Shown while the pull request loads. */
  title: string
  /** Checks the pull request out as a local branch; resolves when that's done or has failed. */
  onCheckout: () => Promise<void>
  onBack: () => void
}

type Tab = 'conversation' | 'files'

// Unsent line comments and the review summary outlive leaving the screen (until the app quits).
const draftsByPr = new Map<string, { comments: DraftReviewComment[]; body: string; event: ReviewEvent }>()

const REVIEW_EVENTS: ReviewEvent[] = ['COMMENT', 'APPROVE', 'REQUEST_CHANGES']

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

export default function PullRequestReview({ repoPath, number, title, onCheckout, onBack }: Props): JSX.Element {
  const key = `${repoPath}#${number}`
  const saved = draftsByPr.get(key)
  const [detail, setDetail] = useState<PullRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('conversation')
  const [checkingOut, setCheckingOut] = useState(false)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [composer, setComposer] = useState<Composer | null>(null)
  const [drafts, setDrafts] = useState<DraftReviewComment[]>(saved?.comments ?? [])
  const [reviewBody, setReviewBody] = useState(saved?.body ?? '')
  const [chosenEvent, setEvent] = useState<ReviewEvent>(saved?.event ?? 'COMMENT')
  // You can only comment on your own pull request.
  const isOwn = !!detail && detail.author === detail.viewer
  const event = isOwn ? 'COMMENT' : chosenEvent
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    draftsByPr.set(key, { comments: drafts, body: reviewBody, event })
  }, [key, drafts, reviewBody, event])

  const showDetail = (res: Awaited<ReturnType<typeof window.api.prGetDetail>>): void => {
    setLoading(false)
    if (res.ok) {
      setDetail(res.data)
      setError(null)
    } else setError(res.error)
  }
  const showFirstDetail = useEffectEvent(showDetail)

  const load = async (): Promise<void> => {
    setLoading(true)
    showDetail(await window.api.prGetDetail(repoPath, number))
  }

  // Launchpad keys this view by pull request, so this loads once; Refresh and actions reload.
  useEffect(() => {
    let cancelled = false
    window.api.prGetDetail(repoPath, number).then((res) => !cancelled && showFirstDetail(res))
    return () => {
      cancelled = true
    }
  }, [repoPath, number])

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
        <button
          className="subtle"
          disabled={checkingOut}
          onClick={async () => {
            setCheckingOut(true)
            await onCheckout()
            setCheckingOut(false)
          }}
          title={detail ? `Check out ${detail.headRefName} as a local branch` : 'Check out as a local branch'}
        >
          {checkingOut ? 'Checking out…' : 'Check out'}
        </button>
        <button className="subtle" onClick={() => detail && window.api.openExternal(detail.url)} disabled={!detail}>
          Open on {detail?.provider === 'azure' ? 'Azure DevOps' : 'GitHub'}
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
