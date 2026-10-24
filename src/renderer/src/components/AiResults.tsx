import type { AiReviewResponse } from '../../../shared/types'

export type AiRunState = 'idle' | 'loading' | 'done' | 'error'

export interface AiRun {
  state: AiRunState
  result: AiReviewResponse | null
  error: string | null
}

export const idleAiRun: AiRun = { state: 'idle', result: null, error: null }

const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 }

interface Props {
  run: AiRun
  onSelectFinding?: (file: string, line?: number) => void
}

export default function AiResults({ run, onSelectFinding }: Props): JSX.Element | null {
  if (run.state === 'loading') {
    return <div className="ai-status">Reviewing…</div>
  }
  if (run.state === 'error') {
    return <div className="ai-error">{run.error}</div>
  }
  if (run.state !== 'done' || !run.result) return null

  const { result } = run
  return (
    <div className="ai-results">
      {result.summary && <div className="ai-summary">{result.summary}</div>}
      {result.findings.length === 0 ? (
        <div className="ai-empty">No issues found.</div>
      ) : (
        <ul className="ai-findings">
          {[...result.findings]
            .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
            .map((f, i) => {
              const clickable = !!(f.file && onSelectFinding)
              return (
                <li
                  key={i}
                  className={`ai-finding sev-${f.severity}${clickable ? ' ai-finding-clickable' : ''}`}
                  onClick={clickable ? () => onSelectFinding!(f.file!, f.line) : undefined}
                >
                  <span className={`ai-sev-badge sev-${f.severity}`}>{f.severity}</span>
                  <div className="ai-finding-body">
                    {f.file && (
                      <div className="ai-finding-loc">
                        {f.file}
                        {f.line ? `:${f.line}` : ''}
                      </div>
                    )}
                    <div>{f.summary}</div>
                  </div>
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}
