import type { JSX } from 'react'
import type { FileStatus, OperationState, RepoStatus } from '../../../../shared/types'
import type { ActiveFile, ConflictActions, OpenFileView } from './types'
import { OPERATION_NAMES, operationSummary } from './operation'
import ConflictedFiles from './ConflictedFiles'
import { onFileListKeyDown } from '../../lib/fileListNav'
import ChangeList from './ChangeList'
import CommitBox from './CommitBox'
import OperationCommitBox from './OperationCommitBox'
import LanesView from './LanesView'
import type { Lanes } from '../../hooks/useLanes'

export interface WorkingProps {
  repoPath: string
  status: RepoStatus | null
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (file: FileStatus) => void
  /** Adds a pattern to the root .gitignore. */
  onIgnore: (pattern: string) => void
  onCommit: () => void
  amend: boolean
  onAmendChange: (amend: boolean) => void
  /** Opens Absorb, which folds staged hunks into earlier commits. */
  onAbsorb: () => void
  operation: OperationState | null
  conflictActions: ConflictActions
  onEditFile: (path: string) => void
  onOpenFileView: OpenFileView
  /** Narrows the graph to the commits touching a file or folder. */
  onFilterHistory?: (path: string) => void
  onCopyText: (text: string) => void
  onOpenFile: (file: FileStatus, staged: boolean) => void
  activeFile: ActiveFile | null
  /** Lanes, which replace the staged/unstaged lists and commit box while they're on. */
  lanes: Lanes
}

/** The side bar for the WIP row: conflicted, unstaged and staged files, and the commit box. */
export default function WorkingDirectoryView({
  repoPath,
  status,
  commitMessage,
  onCommitMessageChange,
  onStage,
  onUnstage,
  onDiscard,
  onIgnore,
  onCommit,
  amend,
  onAmendChange,
  onAbsorb,
  operation,
  conflictActions,
  onEditFile,
  onOpenFileView,
  onFilterHistory,
  onCopyText,
  onOpenFile,
  activeFile,
  lanes
}: WorkingProps): JSX.Element {
  const staged = status?.staged ?? []
  const unstaged = status?.unstaged ?? []
  const conflicted = status?.conflicted ?? []
  const totalChanges = staged.length + unstaged.length + conflicted.length
  const operationName = operation ? OPERATION_NAMES[operation.kind] : null
  const listProps = {
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
  }

  if (lanes.lanes && !operation) {
    return (
      <div className="detail-panel-content" onKeyDown={onFileListKeyDown}>
        <LanesView status={lanes.lanes} actions={lanes} activeFile={activeFile} onOpenFile={onOpenFile} />
      </div>
    )
  }

  return (
    <div className="detail-panel-content" onKeyDown={onFileListKeyDown}>
      {operation ? (
        <div className="operation-header" role="status" aria-label="Operation in progress">
          <div className="operation-header-title">
            <span className="operation-warning" aria-hidden="true">
              ⚠
            </span>
            {conflicted.length > 0 ? `${operationName} conflicts detected` : `${operationName} in progress`}
          </div>
          <div className="operation-strip">{operationSummary(operation)}</div>
        </div>
      ) : (
        <div className="detail-header-row">
          <span>
            {totalChanges} file change{totalChanges === 1 ? '' : 's'} in working directory
          </span>
          <button
            className="link-button lanes-start"
            onClick={() => void lanes.start()}
            title="Work on several branches at once in this working tree, each change in a lane of its own"
          >
            Lanes…
          </button>
        </div>
      )}

      <ConflictedFiles conflicted={conflicted} operation={operation} actions={conflictActions} />
      <ChangeList staged={false} files={unstaged} {...listProps} />
      <ChangeList staged files={staged} {...listProps} />

      {operation ? (
        <OperationCommitBox
          operation={operation}
          conflictCount={conflicted.length}
          stagedCount={staged.length}
          commitMessage={commitMessage}
          onCommitMessageChange={onCommitMessageChange}
          actions={conflictActions}
        />
      ) : (
        <CommitBox
          repoPath={repoPath}
          staged={staged}
          commitMessage={commitMessage}
          onCommitMessageChange={onCommitMessageChange}
          onStage={onStage}
          onCommit={onCommit}
          amend={amend}
          onAmendChange={onAmendChange}
          onAbsorb={onAbsorb}
        />
      )}
    </div>
  )
}
