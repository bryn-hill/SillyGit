import type { ComponentProps, JSX } from 'react'
import BisectBanner from './BisectBanner'

/**
 * The error and notice banners under the toolbar (click to dismiss), the Undo
 * offer after a bulk conflict action, the Restore offer after a branch cleanup,
 * the bisect bar while a bisect is going, and a note when the repo uses Git
 * LFS but git-lfs isn't installed.
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
  onDismissRestore,
  bisect,
  lfsMissing,
  onInstallLfs,
  onDismissLfsMissing
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
  /** The bisect in progress and its actions, or null when there is none. */
  bisect: ComponentProps<typeof BisectBanner> | null
  lfsMissing: boolean
  onInstallLfs: () => void
  onDismissLfsMissing: () => void
}): JSX.Element {
  return (
    <>
      {bisect && <BisectBanner {...bisect} />}
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
      {lfsMissing && (
        <div className="notice-banner conflict-undo-banner" role="status" aria-label="Git LFS not installed">
          This repository stores files in Git LFS, but git-lfs isn’t installed, so they show as small pointer files.
          <button className="link-button" onClick={onInstallLfs}>
            Get Git LFS
          </button>
          <button className="icon-button" title="Dismiss" aria-label="Dismiss" onClick={onDismissLfsMissing}>
            ✕
          </button>
        </div>
      )}
    </>
  )
}
