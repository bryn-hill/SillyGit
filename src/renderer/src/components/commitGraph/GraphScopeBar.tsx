import type { JSX } from 'react'
import { isDefaultScope } from '../../../../shared/graphScope'
import type { GraphScopeActions } from '../../hooks/useBranchActions'

/**
 * Says which branches the graph leaves out, when it leaves any out: a chip for
 * the soloed branch, for "current branch only", or for each hidden branch, each
 * with a button that brings the rest back.
 */
export default function GraphScopeBar({ scope: actions }: { scope: GraphScopeActions }): JSX.Element | null {
  const { scope } = actions
  if (isDefaultScope(scope)) return null
  const chips: { key: string; label: string; clearLabel: string; clear: () => void }[] = []
  if (scope.solo) {
    const solo = scope.solo
    chips.push({ key: 'solo', label: `Only ${solo.name}`, clearLabel: 'Show the other branches', clear: () => actions.toggleSolo(solo) })
  } else if (scope.currentOnly) {
    chips.push({ key: 'current', label: 'Current branch only', clearLabel: 'Show the other branches', clear: actions.toggleCurrentOnly })
  } else {
    for (const branch of scope.hidden) {
      chips.push({
        key: `${branch.remote ? 'remote' : 'local'}:${branch.name}`,
        label: `${branch.name} hidden`,
        clearLabel: `Show ${branch.name}`,
        clear: () => actions.toggleHidden(branch)
      })
    }
  }
  return (
    <div className="graph-filter-bar graph-scope-bar" role="status" data-testid="graph-scope-bar">
      {chips.map((chip) => (
        <span key={chip.key} className="graph-filter-chip" data-testid="graph-scope-chip">
          <span className="graph-filter-label">{chip.label}</span>
          <button className="graph-filter-clear" aria-label={chip.clearLabel} title={chip.clearLabel} onClick={chip.clear}>
            ×
          </button>
        </span>
      ))}
      {(chips.length > 1 || ((scope.solo || scope.currentOnly) && scope.hidden.length > 0)) && (
        <button className="graph-search-step" onClick={actions.showAll}>
          Show all branches
        </button>
      )}
    </div>
  )
}
