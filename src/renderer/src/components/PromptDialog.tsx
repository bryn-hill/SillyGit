import { useState, type JSX } from 'react'

export interface PromptRequest {
  title: string
  label: string
  defaultValue?: string
  submitLabel?: string
}

interface Props extends PromptRequest {
  onSubmit: (value: string) => void
  onCancel: () => void
}

/** A one-field text prompt. Electron doesn't implement window.prompt, so the app uses this instead. */
export default function PromptDialog({
  title,
  label,
  defaultValue = '',
  submitLabel = 'OK',
  onSubmit,
  onCancel
}: Props): JSX.Element {
  const [value, setValue] = useState(defaultValue)
  const submit = (): void => {
    if (value.trim()) onSubmit(value.trim())
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{title}</span>
          <button className="icon-button" onClick={onCancel} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="modal-label">{label}</label>
          <input
            autoFocus
            aria-label={label}
            value={value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              else if (e.key === 'Escape') onCancel()
            }}
          />
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onCancel}>
            Cancel
          </button>
          <button className="commit-button" disabled={!value.trim()} onClick={submit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
