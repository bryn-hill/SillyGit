import { useEffect, useState, type JSX } from 'react'
import type { SprintSettings } from '../../../shared/sprints'
import Select from './Select'
import type { MergeToolSettings } from '../../../shared/mergeTools'
import { resetAvatars } from '../lib/avatars'
import type { BranchListSettings } from '../../../shared/branchStatus'
import AccountsSection from './settings/AccountsSection'
import BranchesSection from './settings/BranchesSection'
import CustomCommandsSection from './settings/CustomCommandsSection'
import MergeToolSection from './settings/MergeToolSection'
import EditorSection from './settings/EditorSection'
import type { EditorSettings, InstalledEditor } from '../../../shared/editors'
import NotificationsSection from './settings/NotificationsSection'
import SprintsSection from './settings/SprintsSection'
import SigningSection from './settings/SigningSection'
import type { CustomCommand } from '../../../shared/customCommands'
import type { ThemePreference } from '../../../shared/theme'
import type { DiffLayout } from '../../../shared/diffLayout'

interface Props {
  onClose: () => void
  /** The open repository, for its own signing settings. */
  repoPath: string | null
  themePreference: ThemePreference
  onThemePreferenceChange: (next: ThemePreference) => void
  autoFetchMinutes: number
  onAutoFetchChange: (minutes: number) => void
  sprints: SprintSettings
  onSprintsChange: (next: SprintSettings) => void
  branchList: BranchListSettings
  onBranchListChange: (next: BranchListSettings) => void
  mergeTool: MergeToolSettings
  onMergeToolChange: (next: MergeToolSettings) => void
  editor: EditorSettings
  installedEditors: InstalledEditor[]
  onEditorChange: (next: EditorSettings) => void
  onRescanEditors: () => void
  mergeAnimation: boolean
  onMergeAnimationChange: (on: boolean) => void
  diffLayout: DiffLayout
  onDiffLayoutChange: (layout: DiffLayout) => void
  customCommands: CustomCommand[]
  onCustomCommandsChange: (next: CustomCommand[]) => void
}

const THEME_CHOICES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match the system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

const AUTO_FETCH_CHOICES = [0, 1, 5, 10, 30]

export default function SettingsModal({
  onClose,
  repoPath,
  themePreference,
  onThemePreferenceChange,
  autoFetchMinutes,
  onAutoFetchChange,
  sprints,
  onSprintsChange,
  branchList,
  onBranchListChange,
  mergeTool,
  onMergeToolChange,
  editor,
  installedEditors,
  onEditorChange,
  onRescanEditors,
  mergeAnimation,
  onMergeAnimationChange,
  diffLayout,
  onDiffLayoutChange,
  customCommands,
  onCustomCommandsChange
}: Props): JSX.Element {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAvatars, setShowAvatars] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.getShowAvatars().then(setShowAvatars)
  }, [])

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

  const toggleAvatars = async (show: boolean): Promise<void> => {
    setShowAvatars(show)
    await window.api.setShowAvatars(show)
    resetAvatars()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Settings</span>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <section className="settings-section">
            <label className="modal-label" htmlFor="theme">
              Appearance
            </label>
            <Select id="theme" value={themePreference} onChange={onThemePreferenceChange} options={THEME_CHOICES} />
          </section>

          <AccountsSection />

          <SigningSection repoPath={repoPath} />

          <NotificationsSection />

          <section className="settings-section">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={showAvatars ?? true}
                disabled={showAvatars === null}
                onChange={(e) => void toggleAvatars(e.target.checked)}
              />
              Show author avatars
            </label>
            <div className="modal-hint">
              Looked up on GitHub, GitLab and Gravatar by commit email, then cached. Off shows initials only.
            </div>
          </section>

          <section className="settings-section">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={mergeAnimation}
                onChange={(e) => onMergeAnimationChange(e.target.checked)}
              />
              Animate new commits and merges on the graph
            </label>
            <div className="modal-hint">
              When commits arrive, whether you commit, merge, pull or fetch, their lines grow into them like a metro
              map. If your system asks for reduced motion, nothing moves.
            </div>
          </section>

          <section className="settings-section">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={diffLayout === 'split'}
                onChange={(e) => onDiffLayoutChange(e.target.checked ? 'split' : 'unified')}
              />
              Show diffs side by side
            </label>
            <div className="modal-hint">
              Old lines on the left, new on the right, in every file diff. The Unified and Side by side buttons above a
              diff switch it too.
            </div>
          </section>

          <BranchesSection branchList={branchList} onChange={onBranchListChange} />

          <SprintsSection sprints={sprints} onChange={onSprintsChange} />

          <EditorSection
            editor={editor}
            installed={installedEditors}
            onChange={onEditorChange}
            onRescan={onRescanEditors}
          />

          <MergeToolSection mergeTool={mergeTool} onChange={onMergeToolChange} />

          <CustomCommandsSection commands={customCommands} onChange={onCustomCommandsChange} />

          <section className="settings-section">
            <label className="modal-label" htmlFor="auto-fetch">
              Fetch in the background
            </label>
            <Select
              id="auto-fetch"
              value={autoFetchMinutes}
              onChange={onAutoFetchChange}
              options={AUTO_FETCH_CHOICES.map((m) => ({
                value: m,
                label: m === 0 ? 'Never' : m === 1 ? 'Every minute' : `Every ${m} minutes`
              }))}
            />
          </section>

          <section className="settings-section">
            <label className="modal-label" htmlFor="anthropic-key">
              Anthropic API key
            </label>
            <div className="settings-inline">
              <input
                id="anthropic-key"
                type="password"
                placeholder="sk-ant-..."
                value={key}
                onChange={(e) => {
                  setKey(e.target.value)
                  setSaved(false)
                }}
              />
              <button className="commit-button" disabled={!key.trim() || saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className="modal-hint">
              Used by the Ask AI review feature. Stored locally on this machine only, never sent anywhere besides
              Anthropic&apos;s API.
            </div>
            {error && <div className="modal-error">{error}</div>}
            {saved && <div className="modal-saved">Saved.</div>}
          </section>
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
