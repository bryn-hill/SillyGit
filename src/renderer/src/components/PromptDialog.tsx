import { useState, type JSX } from 'react'
import Select from './Select'

export interface PromptRequest {
  title: string
  label: string
  defaultValue?: string
  placeholder?: string
  submitLabel?: string
  /** Pick one of these instead of typing. */
  options?: string[]
  /** Values to fill the field with in one click, shown under it; the label is the button's tooltip. */
  suggestions?: { value: string; label: string }[]
  /** A line of help under the field. */
  hint?: string
  /** Lets the field be saved empty, to clear a value. */
  allowEmpty?: boolean
  /** A box for several lines, such as a commit message; Cmd/Ctrl+Enter submits. */
  multiline?: boolean
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
  placeholder,
  submitLabel = 'OK',
  options,
  suggestions,
  hint,
  allowEmpty = false,
  multiline = false,
  onSubmit,
  onCancel
}: Props): JSX.Element {
  const [value, setValue] = useState(options && !options.includes(defaultValue) ? (options[0] ?? '') : defaultValue)
  const submit = (): void => {
    if (value.trim() || allowEmpty) onSubmit(value.trim())
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
          {options ? (
            <Select value={value} options={options.map((o) => ({ value: o, label: o }))} onChange={setValue} aria-label={label} />
          ) : multiline ? (
            <textarea
              autoFocus
              className="prompt-textarea"
              aria-label={label}
              placeholder={placeholder}
              value={value}
              rows={8}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
                else if (e.key === 'Escape') onCancel()
              }}
            />
          ) : (
            <input
              autoFocus
              aria-label={label}
              placeholder={placeholder}
              value={value}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                else if (e.key === 'Escape') onCancel()
              }}
            />
          )}
          {suggestions && suggestions.length > 0 && !options && (
            <div className="prompt-suggestions" role="group" aria-label="Suggestions">
              {suggestions.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`prompt-suggestion${s.value === value ? ' selected' : ''}`}
                  title={s.label}
                  aria-pressed={s.value === value}
                  onClick={() => setValue(s.value)}
                >
                  <span className="prompt-suggestion-label">{s.label}</span>
                  <code>{s.value}</code>
                </button>
              ))}
            </div>
          )}
          {hint && <div className="modal-hint">{hint}</div>}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onCancel}>
            Cancel
          </button>
          <button className="commit-button" disabled={!value.trim() && !allowEmpty} onClick={submit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
