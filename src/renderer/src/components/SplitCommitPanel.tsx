import { useState } from 'react'
import type { CommitSplitProposal } from '../../../shared/types'

interface Props {
  repoPath: string
  hash: string
  onApplied: () => void
}

type SplitState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'review'; proposal: CommitSplitProposal; messages: string[]; applying: boolean; applyError: string | null }
  | { kind: 'error'; message: string }

export default function SplitCommitPanel({ repoPath, hash, onApplied }: Props): JSX.Element {
  const [state, setState] = useState<SplitState>({ kind: 'idle' })

  const runPropose = async (): Promise<void> => {
    setState({ kind: 'loading' })
    const res = await window.api.aiProposeSplit(repoPath, hash)
    if (!res.ok) {
      setState({ kind: 'error', message: res.error })
      return
    }
    setState({
      kind: 'review',
      proposal: res.data,
      messages: res.data.groups.map((g) => g.message),
      applying: false,
      applyError: null
    })
  }

  const updateMessage = (index: number, text: string): void => {
    setState((s) => (s.kind === 'review' ? { ...s, messages: s.messages.map((m, i) => (i === index ? text : m)) } : s))
  }

  const applySplit = async (): Promise<void> => {
    if (state.kind !== 'review') return
    const { proposal, messages } = state
    setState({ ...state, applying: true, applyError: null })
    const finalProposal: CommitSplitProposal = {
      ...proposal,
      groups: proposal.groups.map((g, i) => ({ ...g, message: messages[i] }))
    }
    const res = await window.api.aiApplySplit(repoPath, finalProposal)
    if (!res.ok) {
      setState((s) => (s.kind === 'review' ? { ...s, applying: false, applyError: res.error } : s))
      return
    }
    onApplied()
  }

  if (state.kind === 'idle' || state.kind === 'error') {
    return (
      <div className="split-section">
        <button className="ai-ask-button" onClick={runPropose}>
          🔀 Split commit with AI
        </button>
        {state.kind === 'error' && <div className="ai-error">{state.message}</div>}
      </div>
    )
  }

  if (state.kind === 'loading') {
    return (
      <div className="split-section">
        <button className="ai-ask-button" disabled>
          🔀 Split commit with AI
        </button>
        <div className="ai-status">Analyzing commit…</div>
      </div>
    )
  }

  const { proposal, messages, applying, applyError } = state

  if (proposal.groups.length <= 1) {
    return (
      <div className="split-section">
        <div className="ai-status">This commit already looks focused — no split proposed.</div>
        <button className="split-cancel-button" onClick={() => setState({ kind: 'idle' })}>
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="split-section">
      <div className="split-proposal-title">
        Proposed split into {proposal.groups.length} commits
      </div>
      <ul className="split-groups">
        {proposal.groups.map((g, i) => (
          <li key={i} className="split-group">
            <div className="split-group-index">{i + 1}</div>
            <div className="split-group-body">
              <textarea
                className="split-group-message"
                value={messages[i]}
                onChange={(e) => updateMessage(i, e.target.value)}
                rows={messages[i].split('\n').length}
                disabled={applying}
              />
              <div className="split-group-files">{g.files.join(', ')}</div>
            </div>
          </li>
        ))}
      </ul>
      {applyError && <div className="ai-error">{applyError}</div>}
      <div className="split-actions">
        <button className="split-cancel-button" onClick={() => setState({ kind: 'idle' })} disabled={applying}>
          Cancel
        </button>
        <button className="ai-ask-button" onClick={applySplit} disabled={applying}>
          {applying ? 'Applying…' : 'Apply split'}
        </button>
      </div>
    </div>
  )
}
