import type { JSX } from 'react'

/** The error and notice banners under the toolbar (click to dismiss), and the Undo offer after a bulk conflict action. */
export default function StatusBanners({
  error,
  onDismissError,
  notice,
  onDismissNotice,
  undoMessage,
  onUndo,
  onDismissUndo
}: {
  error: string | null
  onDismissError: () => void
  notice: string | null
  onDismissNotice: () => void
  /** What Undo would undo, or null to offer nothing. */
  undoMessage: string | null
  onUndo: () => void
  onDismissUndo: () => void
}): JSX.Element {
  return (
    <>
      {error && (
        <div className="error-banner" role="alert" onClick={onDismissError}>
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner" role="status" onClick={onDismissNotice}>
          {notice}
        </div>
      )}
      {undoMessage && (
        <div className="notice-banner conflict-undo-banner" role="status" aria-label="Undo conflict action">
          {undoMessage}
          <button className="link-button" onClick={onUndo}>
            Undo
          </button>
          <button className="icon-button" title="Dismiss" onClick={onDismissUndo}>
            ✕
          </button>
        </div>
      )}
    </>
  )
}
