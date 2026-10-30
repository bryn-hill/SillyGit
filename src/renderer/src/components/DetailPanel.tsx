import type { JSX } from 'react'
import type { FileStatus, GraphCommit, OperationState, RepoStatus } from '../../../shared/types'
import type { Selection } from '../lib/selection'
import type { ActiveFile, ConflictActions, MultiCommitActions, OpenFileView } from './detailPanel/types'
import WorkingDirectoryView from './detailPanel/WorkingDirectoryView'
import CommitDetailView from './detailPanel/CommitDetailView'
import MultiCommitView from './detailPanel/MultiCommitView'

export type { ActiveFile, ConflictActions, MultiCommitActions } from './detailPanel/types'

interface Props {
  repoPath: string
  selection: Selection
  lookupCommit: (hash: string) => GraphCommit | undefined
  multiActions: MultiCommitActions
  amend: boolean
  onAmendChange: (amend: boolean) => void
  status: RepoStatus | null
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (file: FileStatus) => void
  onCommit: () => void
  onOpenCommitFileDiff: (hash: string, path: string, line?: number) => void
  headHash: string | null
  /** AI split the checked-out commit. */
  onSplitApplied: () => void
  operation: OperationState | null
  conflictActions: ConflictActions
  onEditFile: (path: string) => void
  onOpenFileView: OpenFileView
  onCopyText: (text: string) => void
  onOpenWorkingFile: (file: FileStatus, staged: boolean) => void
  /** The file shown in the main area, if any, to mark in the lists. */
  activeFile: ActiveFile | null
}

/** The side bar beside the graph: the working changes, one commit, or several selected commits. */
export default function DetailPanel(props: Props): JSX.Element {
  if (props.selection.type === 'commits') {
    return <MultiCommitView hashes={props.selection.hashes} lookup={props.lookupCommit} actions={props.multiActions} />
  }
  if (props.selection.type === 'commit') {
    const { hash } = props.selection
    return (
      <CommitDetailView
        repoPath={props.repoPath}
        hash={hash}
        headHash={props.headHash}
        activePath={props.activeFile?.path ?? null}
        onOpenFileDiff={props.onOpenCommitFileDiff}
        onSplitApplied={props.onSplitApplied}
        onOpenFileView={props.onOpenFileView}
        onCopyText={props.onCopyText}
      />
    )
  }
  return (
    <WorkingDirectoryView
      repoPath={props.repoPath}
      status={props.status}
      commitMessage={props.commitMessage}
      onCommitMessageChange={props.onCommitMessageChange}
      onStage={props.onStage}
      onUnstage={props.onUnstage}
      onDiscard={props.onDiscard}
      onCommit={props.onCommit}
      amend={props.amend}
      onAmendChange={props.onAmendChange}
      operation={props.operation}
      conflictActions={props.conflictActions}
      onEditFile={props.onEditFile}
      onOpenFileView={props.onOpenFileView}
      onCopyText={props.onCopyText}
      onOpenFile={props.onOpenWorkingFile}
      activeFile={props.activeFile}
    />
  )
}
