import { Fragment, useState, type JSX } from 'react'
import { GIT_FLOW_KINDS, gitFlowConfigProblem, type GitFlowConfig, type GitFlowKind } from '../../../shared/gitflow'

interface Props {
  initial: GitFlowConfig
  onSave: (config: GitFlowConfig) => void
  onCancel: () => void
}

const KIND_LABELS: Record<GitFlowKind, string> = {
  feature: 'Feature prefix',
  release: 'Release prefix',
  hotfix: 'Hotfix prefix'
}

/** git-flow's branches and prefixes, saved to the repo's gitflow.* config like `git flow init`. */
export default function GitFlowSetupDialog({ initial, onSave, onCancel }: Props): JSX.Element {
  const [config, setConfig] = useState(initial)
  const problem = gitFlowConfigProblem(config)

  const field = (label: string, value: string, onChange: (value: string) => void, placeholder?: string): JSX.Element => (
    <label className="gitflow-field">
      <span className="modal-label">{label}</span>
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !problem) onSave(config)
          else if (e.key === 'Escape') onCancel()
        }}
      />
    </label>
  )

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal gitflow-modal" role="dialog" aria-label="Set up git-flow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Set up git-flow</span>
          <button className="icon-button" onClick={onCancel} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-hint">
            Saved in this repository’s git config, so the git-flow command line tool sees the same settings. The
            development branch is created from production if it doesn’t exist.
          </div>
          <div className="gitflow-grid">
            {field('Production branch', config.master, (master) => setConfig({ ...config, master }))}
            {field('Development branch', config.develop, (develop) => setConfig({ ...config, develop }))}
            {GIT_FLOW_KINDS.map((kind) => (
              <Fragment key={kind}>
                {field(KIND_LABELS[kind], config.prefixes[kind], (prefix) =>
                  setConfig({ ...config, prefixes: { ...config.prefixes, [kind]: prefix } })
                )}
              </Fragment>
            ))}
            {field('Version tag prefix', config.versionTag, (versionTag) => setConfig({ ...config, versionTag }), 'none, or e.g. v')}
          </div>
          {problem && <div className="modal-error">{problem}</div>}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onCancel}>
            Cancel
          </button>
          <button className="commit-button" disabled={!!problem} onClick={() => onSave(config)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
