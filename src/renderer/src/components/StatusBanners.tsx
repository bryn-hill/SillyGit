import type { JSX } from 'react'

/**
 * The error and notice banners under the toolbar (click to dismiss), the Undo
 * offer after a bulk conflict action, and the Restore offer after a branch cleanup.
 */
export default function StatusBanners({
  error,
  onDismissError,
  notice,
  onDismissNotice,
  undoMessage,
  onUndo,
  onDismissUndo,
  restoreMessage,
  onRestore,
  onDismissRestore
}: {
  error: string | null
  onDismissError: () => void
  notice: string | null
  onDismissNotice: () => void
  /** What Undo would undo, or null to offer nothing. */
  undoMessage: string | null
  onUndo: () => void
  onDismissUndo: () => void
  /** What Restore would bring back, or null to offer nothing. */
  restoreMessage: string | null
  onRestore: () => void
  onDismissRestore: () => void
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
      {restoreMessage && (
        <div className="notice-banner conflict-undo-banner" role="status" aria-label="Restore deleted branches">
          {restoreMessage}
          <button className="link-button" onClick={onRestore}>
            Restore
          </button>
          <button className="icon-button" title="Dismiss" onClick={onDismissRestore}>
            ✕
          </button>
        </div>
      )}
    </>
  )
}
