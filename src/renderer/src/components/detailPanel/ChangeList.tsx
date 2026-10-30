import { useContext, useState, type JSX } from 'react'
import type { FileStatus } from '../../../../shared/types'
import ContextMenu from '../ContextMenu'
import { fileMenuSections } from '../fileMenu'
import { LfsContext } from '../../lib/lfs'
import LfsBadge from '../LfsBadge'
import { useCustomCommandMenu } from '../../lib/customCommandMenu'
import { EditorContext } from '../../lib/editorMenu'
import type { ActiveFile, OpenFileView } from './types'

function statusLabel(code: string): string {
  return code === '?' ? 'U' : code
}

/** The Unstaged or Staged list of working changes, with Stage All / Unstage All and each file's menu. */
export default function ChangeList({
  staged,
  files,
  activeFile,
  onOpenFile,
  onEditFile,
  onDiscard,
  onIgnore,
  onStage,
  onUnstage,
  onOpenFileView,
  onFilterHistory,
  onCopyText
}: {
  /** Which list this is. */
  staged: boolean
  files: FileStatus[]
  activeFile: ActiveFile | null
  onOpenFile: (file: FileStatus, staged: boolean) => void
  onEditFile: (path: string) => void
  onDiscard: (file: FileStatus) => void
  onIgnore: (pattern: string) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onOpenFileView: OpenFileView
  onFilterHistory?: (path: string) => void
  onCopyText: (text: string) => void
}): JSX.Element {
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; file: FileStatus } | null>(null)
  const customMenu = useCustomCommandMenu()
  const lfs = useContext(LfsContext)
  const editor = useContext(EditorContext)

  const renderRow = (file: FileStatus): JSX.Element => {
    const key = `${staged ? 's' : 'u'}:${file.path}`
    const active = activeFile?.path === file.path && !!activeFile.staged === staged
    return (
      <li key={key}>
        <div
          className={`file-row ${active ? 'active' : ''}`}
          aria-current={active}
          tabIndex={-1}
          onClick={() => onOpenFile(file, staged)}
          onContextMenu={(e) => {
            e.preventDefault()
            setFileMenu({ x: e.clientX, y: e.clientY, file })
          }}
        >
          <span className={`status-code code-${statusLabel(file.index !== '.' && staged ? file.index : file.worktree)}`}>
            {statusLabel(file.index !== '.' && staged ? file.index : file.worktree)}
          </span>
          <span className="file-path">{file.path}</span>
          {file.lfs && <LfsBadge />}
          <span className="file-actions">
            {(staged ? file.index : file.worktree) !== 'D' && (
              <button
                className="icon-button"
                title="Edit file"
                aria-label={`Edit ${file.path}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onEditFile(file.path)
                }}
              >
                ✎
              </button>
            )}
            {!staged && (
              <button
                className="icon-button"
                title="Discard changes"
                onClick={(e) => {
                  e.stopPropagation()
                  onDiscard(file)
                }}
              >
                ↺
              </button>
            )}
            <button
              className="icon-button"
              title={staged ? 'Unstage' : 'Stage'}
              onClick={(e) => {
                e.stopPropagation()
                staged ? onUnstage([file.path]) : onStage([file.path])
              }}
            >
              {staged ? '−' : '+'}
            </button>
          </span>
        </div>
      </li>
    )
  }

  return (
    <div className="detail-section">
      <div className="detail-section-header">
        <span>
          {staged ? 'Staged' : 'Unstaged'} ({files.length})
        </span>
        {files.length > 0 && (
          <button
            className="link-button"
            onClick={() => (staged ? onUnstage : onStage)(files.map((f) => f.path))}
          >
            {staged ? 'Unstage All' : 'Stage All'}
          </button>
        )}
      </div>
      <ul className="file-list">{files.map(renderRow)}</ul>
      {fileMenu && (
        <ContextMenu
          x={fileMenu.x}
          y={fileMenu.y}
          sections={fileMenuSections({
            path: fileMenu.file.path,
            deleted: (staged ? fileMenu.file.index : fileMenu.file.worktree) === 'D',
            // A newly added file has no commits to blame or list yet.
            untracked: fileMenu.file.untracked || fileMenu.file.index === 'A',
            onOpenDiff: () => onOpenFile(fileMenu.file, staged),
            onEdit: () => onEditFile(fileMenu.file.path),
            onBlame: () => onOpenFileView(fileMenu.file.path, null, 'blame'),
            onHistory: () => onOpenFileView(fileMenu.file.path, null, 'history'),
            onFilterHistory,
            onOpenInEditor: () => editor.open(fileMenu.file.path),
            editorName: editor.name,
            onCopyPath: () => onCopyText(fileMenu.file.path),
            lfs: { installed: lfs.info.installed, tracked: !!fileMenu.file.lfs, onTrack: lfs.track },
            // Only untracked files: ignoring a tracked file does nothing until it's removed from the index.
            onIgnore: fileMenu.file.untracked ? onIgnore : undefined,
            custom: customMenu('file', { file: fileMenu.file.path })
          })}
          onClose={() => setFileMenu(null)}
        />
      )}
    </div>
  )
}
