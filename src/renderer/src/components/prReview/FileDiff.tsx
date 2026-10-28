import { Fragment, useMemo, type JSX, type MouseEvent } from 'react'
import {
  threadsByLine,
  type DiffSide,
  type DraftReviewComment,
  type PrFile,
  type PrReviewThread
} from '../../../../shared/prReview'
import { renderFileDiff, type RenderedDiffLine } from '../../lib/diffRender'
import { highlightLine, languageForPath } from '../../lib/highlight'
import { CommentBox, DraftView, ThreadView } from './comments'

export interface Composer {
  path: string
  side: DiffSide
  line: number
  startLine?: number
}

/** Which side and line a diff row is commented on: removed lines on the old side, the rest on the new. */
function rowAnchor(line: RenderedDiffLine): { side: DiffSide; line: number } {
  return line.type === 'remove' ? { side: 'LEFT', line: line.oldLine! } : { side: 'RIGHT', line: line.newLine! }
}

export default function FileDiff({
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
