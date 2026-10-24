import { useState } from 'react'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props): JSX.Element {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (): Promise<void> => {
    if (!key.trim()) return
    setSaving(true)
    setError(null)
    const res = await window.api.setApiKey(key.trim())
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSaved(true)
    setKey('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Settings</span>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="modal-label">Anthropic API key</label>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setSaved(false)
            }}
          />
          <div className="modal-hint">
            Used by the Ask AI review feature. Stored locally on this machine only, never sent
            anywhere besides Anthropic&apos;s API.
          </div>
          {error && <div className="modal-error">{error}</div>}
          {saved && <div className="modal-saved">Saved.</div>}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onClose}>
            Close
          </button>
          <button className="commit-button" disabled={!key.trim() || saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
