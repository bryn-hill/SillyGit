import { useState, type JSX } from 'react'
import type { DraftReviewComment, PrReviewThread } from '../../../../shared/prReview'
import { timeAgo } from '../../lib/timeAgo'
import Avatar from '../Avatar'

export function Body({ text }: { text: string }): JSX.Element {
  return text.trim() ? <div className="pr-body-text">{text}</div> : <div className="pr-body-empty">No description.</div>
}

export function CommentBox({
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

export function CommentView({ author, createdAt, body }: { author: string; createdAt: string; body: string }): JSX.Element {
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

export function ThreadView({
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

export function DraftView({
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
