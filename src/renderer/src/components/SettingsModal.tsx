import { useEffect, useState, type JSX } from 'react'
import {
  PROVIDERS,
  PROVIDER_ORDER,
  normalizeHost,
  type GitProvider,
  type ProviderAccount
} from '../../../shared/accounts'
import {
  NOTIFICATION_INTERVAL_CHOICES,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KIND_ORDER,
  type NotificationSettings
} from '../../../shared/notifications'
import {
  SPRINT_LENGTH_CHOICES,
  localDay,
  parseDay,
  sprintAt,
  sprintIndexOfDay,
  sprintLabel,
  type SprintSettings
} from '../../../shared/sprints'
import Avatar from './Avatar'
import { resetAvatars } from '../lib/avatars'

interface Props {
  onClose: () => void
  autoFetchMinutes: number
  onAutoFetchChange: (minutes: number) => void
  sprints: SprintSettings
  onSprintsChange: (next: SprintSettings) => void
}

const AUTO_FETCH_CHOICES = [0, 1, 5, 10, 30]

function AddAccountForm({ onAdded, onCancel }: { onAdded: (account: ProviderAccount) => void; onCancel: () => void }): JSX.Element {
  const [provider, setProvider] = useState<GitProvider>('github')
  const [host, setHost] = useState(PROVIDERS.github.defaultHost)
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const info = PROVIDERS[provider]
  const cleanHost = info.hostEditable ? normalizeHost(host) : info.defaultHost
  const ready = !!token.trim() && !!cleanHost && (!info.needsUsername || !!username.trim())

  const choose = (next: GitProvider): void => {
    setProvider(next)
    setHost(PROVIDERS[next].defaultHost)
    setError(null)
  }

  const submit = async (): Promise<void> => {
    if (!ready) return
    setBusy(true)
    setError(null)
    const res = await window.api.addAccount({ provider, host: cleanHost, username: username.trim(), token: token.trim() })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setToken('')
    onAdded(res.data)
  }

  return (
    <form
      className="account-form"
      aria-label="Add account"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="account-provider-tabs" role="radiogroup" aria-label="Service">
        {PROVIDER_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === provider}
            className={p === provider ? 'active' : ''}
            onClick={() => choose(p)}
          >
            {PROVIDERS[p].label}
          </button>
        ))}
      </div>
      {info.hostEditable && (
        <>
          <label className="modal-label" htmlFor="account-host">
            Server
          </label>
          <input
            id="account-host"
            placeholder={info.defaultHost || 'git.example.com'}
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </>
      )}
      {info.needsUsername && (
        <>
          <label className="modal-label" htmlFor="account-username">
            Atlassian account email
          </label>
          <input
            id="account-username"
            type="email"
            placeholder="you@example.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </>
      )}
      <label className="modal-label" htmlFor="account-token">
        Personal access token
      </label>
      <input
        id="account-token"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <div className="modal-hint">
        {info.scopesHint}{' '}
        <button
          type="button"
          className="link-button"
          disabled={!cleanHost}
          onClick={() => void window.api.openExternal(info.tokenUrl(cleanHost))}
        >
          Create a token
        </button>
      </div>
      {error && (
        <div className="modal-error" role="alert">
          {error}
        </div>
      )}
      <div className="account-form-actions">
        <button type="button" className="subtle" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="commit-button" disabled={!ready || busy}>
          {busy ? 'Checking…' : 'Add account'}
        </button>
      </div>
    </form>
  )
}

function AccountsSection(): JSX.Element {
  const [accounts, setAccounts] = useState<ProviderAccount[] | null>(null)
  const [storageProblem, setStorageProblem] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    window.api.listAccounts().then((res) => setAccounts(res.ok ? res.data : []))
    window.api.accountStorageProblem().then(setStorageProblem)
  }, [])

  const remove = async (account: ProviderAccount): Promise<void> => {
    const ok = window.confirm(`Remove ${account.username} on ${account.host}? Its token is deleted from this computer.`)
    if (!ok) return
    const res = await window.api.removeAccount(account.id)
    if (res.ok) setAccounts(res.data)
  }

  return (
    <section className="settings-section" aria-label="Accounts">
      <div className="modal-label">Accounts</div>
      {accounts && accounts.length === 0 && !adding && (
        <div className="modal-hint">
          Add a personal access token to push and pull over HTTPS, see pull requests in Launchpad without the GitHub
          CLI, and show your team&apos;s avatars.
        </div>
      )}
      {accounts && accounts.length > 0 && (
        <ul className="account-list">
          {accounts.map((a) => (
            <li key={a.id} className="account-row">
              {a.avatar ? (
                <span className="avatar" style={{ width: 28, height: 28 }}>
                  <img src={a.avatar} alt="" />
                </span>
              ) : (
                <Avatar name={a.displayName} size={28} />
              )}
              <div className="account-row-text">
                <div className="account-row-name">{a.displayName}</div>
                <div className="commit-meta-dim">
                  {PROVIDERS[a.provider].label} · {a.username}
                  {a.host !== PROVIDERS[a.provider].defaultHost && ` · ${a.host}`}
                </div>
              </div>
              <button className="subtle" aria-label={`Remove ${a.username} on ${a.host}`} onClick={() => void remove(a)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {storageProblem ? (
        <div className="modal-error">{storageProblem}</div>
      ) : adding ? (
        <AddAccountForm
          onCancel={() => setAdding(false)}
          onAdded={(account) => {
            setAccounts((list) => [...(list ?? []).filter((a) => a.id !== account.id), account])
            setAdding(false)
            resetAvatars()
          }}
        />
      ) : (
        <div>
          <button onClick={() => setAdding(true)}>Add account…</button>
        </div>
      )}
      <div className="modal-hint">
        Tokens are encrypted with your system&apos;s keychain and only sent to the service they belong to.
      </div>
    </section>
  )
}

function NotificationsSection(): JSX.Element {
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
            <select
              id="notification-interval"
              value={prefs.intervalMinutes}
              disabled={off}
              onChange={(e) => void update({ ...prefs, intervalMinutes: Number(e.target.value) })}
            >
              {NOTIFICATION_INTERVAL_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 1 ? 'Every minute' : `Every ${m} minutes`}
                </option>
              ))}
            </select>
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

function SprintsSection({
  sprints,
  onChange
}: {
  sprints: SprintSettings
  onChange: (next: SprintSettings) => void
}): JSX.Element {
  // Drafts, so a half-typed date or number isn't thrown away mid-edit.
  const [startDate, setStartDate] = useState(sprints.startDate)
  const [startNumber, setStartNumber] = useState(String(sprints.startNumber))
  useEffect(() => setStartDate(sprints.startDate), [sprints.startDate])
  useEffect(() => setStartNumber(String(sprints.startNumber)), [sprints.startNumber])

  const today = localDay(new Date().toISOString())
  const current = today === null ? null : sprintAt(sprintIndexOfDay(today, sprints), sprints)

  return (
    <section className="settings-section" aria-label="Sprints">
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={sprints.enabled}
          onChange={(e) => onChange({ ...sprints, enabled: e.target.checked })}
        />
        Show sprints on the graph
      </label>
      <div className="modal-hint">
        Draws a divider where each sprint starts and shades alternate sprints, so you can see which commits landed in
        which sprint.
      </div>
      {sprints.enabled && (
        <div className="settings-suboptions">
          <div className="settings-inline">
            <label htmlFor="sprint-length">Sprints last</label>
            <select
              id="sprint-length"
              value={sprints.lengthWeeks}
              onChange={(e) => onChange({ ...sprints, lengthWeeks: Number(e.target.value) })}
            >
              {SPRINT_LENGTH_CHOICES.map((w) => (
                <option key={w} value={w}>
                  {w === 1 ? '1 week' : `${w} weeks`}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-inline sprint-start-row">
            <label htmlFor="sprint-start">A sprint started on</label>
            <input
              id="sprint-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                if (parseDay(e.target.value) !== null) onChange({ ...sprints, startDate: e.target.value })
              }}
            />
            <label htmlFor="sprint-number">and was number</label>
            <input
              id="sprint-number"
              className="sprint-number-input"
              type="number"
              value={startNumber}
              onChange={(e) => {
                setStartNumber(e.target.value)
                const n = Number(e.target.value)
                if (e.target.value.trim() && Number.isInteger(n)) onChange({ ...sprints, startNumber: n })
              }}
            />
          </div>
          {current && (
            <div className="modal-hint" data-testid="current-sprint">
              Now: {sprintLabel(current, new Date().getFullYear())}. Commits are placed by commit date in your time
              zone.
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default function SettingsModal({
  onClose,
  autoFetchMinutes,
  onAutoFetchChange,
  sprints,
  onSprintsChange
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
          <AccountsSection />

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

          <SprintsSection sprints={sprints} onChange={onSprintsChange} />

          <section className="settings-section">
            <label className="modal-label" htmlFor="auto-fetch">
              Fetch in the background
            </label>
            <select
              id="auto-fetch"
              value={autoFetchMinutes}
              onChange={(e) => onAutoFetchChange(Number(e.target.value))}
            >
              {AUTO_FETCH_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Never' : m === 1 ? 'Every minute' : `Every ${m} minutes`}
                </option>
              ))}
            </select>
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
