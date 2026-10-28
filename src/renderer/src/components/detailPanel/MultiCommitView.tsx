import type { JSX } from 'react'
import type { GraphCommit } from '../../../../shared/types'
import { pressable } from '../../lib/pressable'
import type { MultiCommitActions } from './types'

/** The side bar when several commits are selected. `hashes` is newest first. */
export default function MultiCommitView({
  hashes,
  lookup,
  actions
}: {
  hashes: string[]
  lookup: (hash: string) => GraphCommit | undefined
  actions: MultiCommitActions
}): JSX.Element {
  const oldestFirst = [...hashes].reverse()
  return (
    <div className="detail-panel-content">
      <div className="detail-header-row">
        <span>{hashes.length} commits selected</span>
      </div>
      <div className="multi-commit-actions">
        <button onClick={() => actions.cherryPick(oldestFirst)}>Cherry-pick {hashes.length} commits</button>
        <button onClick={() => actions.revert(hashes)}>Revert {hashes.length} commits</button>
        <button onClick={() => actions.copyText(hashes.join('\n'))}>Copy SHAs</button>
      </div>
      <ul className="file-list multi-commit-list" aria-label="Selected commits">
        {hashes.map((hash) => {
          const commit = lookup(hash)
          return (
            <li key={hash}>
              <div className="file-row" title="Show only this commit" {...pressable(() => actions.select(hash))}>
                <span className="multi-commit-sha">{hash.slice(0, 7)}</span>
                <span className="file-path">{commit?.subject ?? ''}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
