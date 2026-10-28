import type { OperationState } from '../../../../shared/types'

export const OPERATION_NAMES: Record<OperationState['kind'], string> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert'
}

/** "Merging feature into main", "Rebasing feature onto main (commit 2 of 3)" etc. */
export function operationSummary(op: OperationState): string {
  switch (op.kind) {
    case 'merge':
      return `Merging ${op.incomingLabel} into ${op.currentLabel}`
    case 'rebase': {
      const progress = op.step && op.total ? ` (commit ${op.step} of ${op.total})` : ''
      return `Rebasing ${op.rebaseBranch ?? 'HEAD'} onto ${op.currentLabel}${progress}`
    }
    case 'cherry-pick':
      return `Cherry-picking ${op.incomingLabel} onto ${op.currentLabel}`
    case 'revert':
      return `Reverting ${op.incomingLabel.replace(/^revert of /, '')} on ${op.currentLabel}`
  }
}
