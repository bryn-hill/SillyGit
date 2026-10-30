import { useState, type JSX } from 'react'
import { bisectFinished, bisectSummary, type BisectState, type BisectVerdict } from '../../../shared/bisect'
import type { BisectCommandChoice } from '../hooks/useBisect'
import ContextMenu from './ContextMenu'

/**
 * The bar shown while a bisect is going: where it has got to, Good / Bad /
 * Skip for the checked-out commit, a command to decide the rest, and Reset.
 * Once bisect is done, a way to the first bad commit.
 */
export default function BisectBanner({
  state,
  busy,
  running,
  onMark,
  onReset,
  commandChoices,
  onRunWith,
  onStopRun,
  onShowCommit
}: {
  state: BisectState
  busy: boolean
  /** Whether `git bisect run` is going in the terminal. */
  running: boolean
  onMark: (verdict: BisectVerdict) => void
  onReset: () => void
  commandChoices: () => BisectCommandChoice[]
  onRunWith: (command: string | null) => void
  onStopRun: () => void
  onShowCommit: (hash: string) => void
}): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; choices: BisectCommandChoice[] } | null>(null)
  const finished = bisectFinished(state)
  const testing = !finished && !!state.bad && state.good.length > 0
  const { bad, good } = state.terms
  const disabled = busy || running

  return (
    <div className={`bisect-banner ${finished ? 'finished' : ''}`} role="region" aria-label="Bisect">
      <span className="bisect-summary" data-testid="bisect-summary">
        {bisectSummary(state)}
      </span>
      <div className="bisect-actions">
        {testing && (
          <>
            <button className="bisect-good" disabled={disabled} title={`The checked-out commit is ${good}`} onClick={() => onMark('good')}>
              {capitalize(good)}
            </button>
            <button className="bisect-bad" disabled={disabled} title={`The checked-out commit is ${bad}`} onClick={() => onMark('bad')}>
              {capitalize(bad)}
            </button>
            <button disabled={disabled} title="Can't test this commit; try a nearby one" onClick={() => onMark('skip')}>
              Skip
            </button>
            {running ? (
              <button onClick={onStopRun}>Stop run</button>
            ) : (
              <button
                disabled={busy}
                title="Let a command test each commit: exit 0 is good, 125 skips, other failures are bad"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setMenu({ x: rect.left, y: rect.bottom + 4, choices: commandChoices() })
                }}
              >
                Run a command to decide…
              </button>
            )}
          </>
        )}
        {state.firstBad && (
          <button className="link-button" onClick={() => onShowCommit(state.firstBad!)}>
            Show commit
          </button>
        )}
        <button disabled={busy} title={`End the bisect and go back to ${state.startedFrom}`} onClick={onReset}>
          Reset
        </button>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sections={[menu.choices.map((c) => ({ id: c.id, label: c.label, title: c.command ?? undefined, onSelect: () => onRunWith(c.command) }))]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
