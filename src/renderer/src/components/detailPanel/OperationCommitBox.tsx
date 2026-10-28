import type { JSX } from 'react'
import type { OperationState } from '../../../../shared/types'
import type { ConflictActions } from './types'
import { OPERATION_NAMES } from './operation'

/** The commit area while a merge, rebase, cherry-pick or revert is stopped. */
export default function OperationCommitBox({
  operation,
  conflictCount,
  stagedCount,
  commitMessage,
  onCommitMessageChange,
  actions
}: {
  operation: OperationState
  conflictCount: number
  stagedCount: number
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  actions: ConflictActions
}): JSX.Element {
  const name = OPERATION_NAMES[operation.kind]
  const isRebase = operation.kind === 'rebase'
  // With nothing left to commit, a rebase or pick can only skip this commit.
  const canSkip = operation.kind !== 'merge' && stagedCount === 0 && conflictCount === 0
  const mainLabel = canSkip
    ? 'Skip Commit'
    : operation.kind === 'merge'
      ? 'Commit and Merge'
      : isRebase
        ? 'Continue Rebase'
        : `Commit ${name}`
  const blocked = conflictCount > 0
  return (
    <div className="commit-box">
      {!isRebase && (
        <textarea
          placeholder="Commit message"
          value={commitMessage}
          onChange={(e) => onCommitMessageChange(e.target.value)}
        />
      )}
      {blocked && (
        <div className="operation-hint">
          Resolve {conflictCount === 1 ? 'the conflicted file' : `all ${conflictCount} conflicted files`} to
          continue.
        </div>
      )}
      <button
        className="commit-button"
        disabled={blocked || (!canSkip && !isRebase && !commitMessage.trim())}
        onClick={canSkip ? actions.onSkip : actions.onContinue}
      >
        {mainLabel}
      </button>
      <button className="abort-button" onClick={actions.onAbort}>
        Abort {name}
      </button>
    </div>
  )
}
