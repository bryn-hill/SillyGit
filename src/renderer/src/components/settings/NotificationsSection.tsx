import { useEffect, useState, type JSX } from 'react'
import {
  NOTIFICATION_INTERVAL_CHOICES,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KIND_ORDER,
  type NotificationSettings
} from '../../../../shared/notifications'
import Select from '../Select'

export default function NotificationsSection(): JSX.Element {
  const [prefs, setPrefs] = useState<NotificationSettings | null>(null)
  const [hasGithub, setHasGithub] = useState<boolean | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    window.api.getNotificationSettings().then(setPrefs)
    window.api.listAccounts().then((res) => setHasGithub(res.ok && res.data.some((a) => a.provider === 'github')))
  }, [])

  const update = async (next: NotificationSettings): Promise<void> => {
    setPrefs(next)
    const res = await window.api.setNotificationSettings(next)
    if (res.ok) setPrefs(res.data)
  }

  const test = async (): Promise<void> => {
    const res = await window.api.testNotification()
    setTestResult(res.ok ? 'Sent. If nothing appeared, allow SillyGit in your system\'s notification settings.' : res.error)
  }

  const off = !prefs?.enabled
  return (
    <section className="settings-section" aria-label="Notifications">
      <div className="modal-label">Notifications</div>
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={prefs?.enabled ?? false}
          disabled={!prefs}
          onChange={(e) => prefs && void update({ ...prefs, enabled: e.target.checked })}
        />
        Pull request notifications
      </label>
      <div className="modal-hint">
        Desktop notifications from your GitHub accounts. New pull requests are watched in repositories you own and ones
        you&apos;ve opened in SillyGit, including ones a coding agent opens under your name.
      </div>
      {hasGithub === false && <div className="modal-hint">Add a GitHub account above to get them.</div>}
      {prefs && (
        <div className="settings-suboptions">
          {NOTIFICATION_KIND_ORDER.map((kind) => (
            <label key={kind} className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.kinds[kind]}
                disabled={off}
                onChange={(e) => void update({ ...prefs, kinds: { ...prefs.kinds, [kind]: e.target.checked } })}
              />
              {NOTIFICATION_KIND_LABELS[kind]}
            </label>
          ))}
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={prefs.includeMyOwnPullRequests}
              disabled={off || !prefs.kinds.newPullRequest}
              onChange={(e) => void update({ ...prefs, includeMyOwnPullRequests: e.target.checked })}
            />
            Include new pull requests I opened myself
          </label>
          <div className="settings-inline">
            <label htmlFor="notification-interval">Check</label>
            <Select
              id="notification-interval"
              value={prefs.intervalMinutes}
              disabled={off}
              onChange={(intervalMinutes) => void update({ ...prefs, intervalMinutes })}
              options={NOTIFICATION_INTERVAL_CHOICES.map((m) => ({
                value: m,
                label: m === 1 ? 'Every minute' : `Every ${m} minutes`
              }))}
            />
            <button type="button" className="subtle" disabled={off} onClick={() => void test()}>
              Send a test notification
            </button>
          </div>
          {testResult && <div className="modal-hint">{testResult}</div>}
        </div>
      )}
    </section>
  )
}
