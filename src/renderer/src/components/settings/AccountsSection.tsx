import { useEffect, useState, type JSX } from 'react'
import {
  PROVIDERS,
  PROVIDER_ORDER,
  normalizeHost,
  type GitProvider,
  type ProviderAccount
} from '../../../../shared/accounts'
import Avatar from '../Avatar'
import { resetAvatars } from '../../lib/avatars'
import { resetJiraSites } from '../../lib/jira'

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
            placeholder={info.defaultHost || info.hostPlaceholder || 'git.example.com'}
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </>
      )}
      {(info.needsUsername || info.optionalUsername) && (
        <>
          <label className="modal-label" htmlFor="account-username">
            Atlassian account email
          </label>
          <input
            id="account-username"
            type="email"
            placeholder={info.optionalUsername ? 'you@example.com (Jira Cloud only)' : 'you@example.com'}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </>
      )}
      <label className="modal-label" htmlFor="account-token">
        {info.issueTracker ? 'API token' : 'Personal access token'}
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

export default function AccountsSection(): JSX.Element {
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
    if (PROVIDERS[account.provider].issueTracker) resetJiraSites()
  }

  return (
    <section className="settings-section" aria-label="Accounts">
      <div className="modal-label">Accounts</div>
      {accounts && accounts.length === 0 && !adding && (
        <div className="modal-hint">
          Add a personal access token to push and pull over HTTPS, see pull requests in Launchpad without the GitHub
          CLI, and show your team&apos;s avatars. Add Jira to see your Jira issues in Launchpad and link issue keys.
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
            if (PROVIDERS[account.provider].issueTracker) resetJiraSites()
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
