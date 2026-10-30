import { useEffect, useId, useState, type JSX } from 'react'
import type { ProviderAccount } from '../../../shared/accounts'
import {
  accountLabel,
  filterHostedRepos,
  gitHostAccounts,
  type HostedRepo,
  type HostedRepoList
} from '../../../shared/hostedRepos'
import Select from './Select'

interface Props {
  /** Clones `url` (after asking for a folder). */
  onClone: (url: string) => void
  onOpenSettings: () => void
  onClose: () => void
}

/** How many matches the list shows; searching narrows the rest down. */
const SHOWN = 200

const repoKey = (r: HostedRepo): string => `${r.accountId}\0${r.fullName}`

/**
 * Clone by URL, or pick one of the repositories the signed-in GitHub,
 * GitLab, Bitbucket, Azure DevOps or Gitea accounts can reach.
 */
export default function CloneDialog({ onClone, onOpenSettings, onClose }: Props): JSX.Element {
  const ids = useId()
  const [accounts, setAccounts] = useState<ProviderAccount[] | null>(null)
  const [list, setList] = useState<HostedRepoList | null>(null)
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [selected, setSelected] = useState<HostedRepo | null>(null)
  const [useSsh, setUseSsh] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    let current = true
    window.api.listAccounts().then((res) => {
      if (!current) return
      const hosts = res.ok ? gitHostAccounts(res.data) : []
      setAccounts(hosts)
      if (hosts.length === 0) return
      window.api.hostedRepos().then((repos) => {
        if (current) setList(repos.ok ? repos.data : { repos: [], errors: [{ accountId: '', message: repos.error }] })
      })
    })
    return () => {
      current = false
    }
  }, [])

  const urlFor = (repo: HostedRepo, ssh: boolean): string => (ssh && repo.sshUrl ? repo.sshUrl : repo.cloneUrl)

  const pick = (repo: HostedRepo): void => {
    setSelected(repo)
    setUrl(urlFor(repo, useSsh))
  }

  const changeSsh = (ssh: boolean): void => {
    setUseSsh(ssh)
    if (selected) setUrl(urlFor(selected, ssh))
  }

  const changeUrl = (text: string): void => {
    setUrl(text)
    // Typing a different URL means it's no longer the picked repo.
    if (selected && text !== urlFor(selected, useSsh)) setSelected(null)
  }

  const clone = (target = url): void => {
    if (target.trim()) onClone(target.trim())
  }

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]))
  const inAccount = list?.repos.filter((r) => !accountFilter || r.accountId === accountFilter) ?? []
  const matches = filterHostedRepos(inAccount, query)
  const shown = matches.slice(0, SHOWN)
  const showAccount = (accounts?.length ?? 0) > 1
  const errors = (list?.errors ?? []).filter((e) => !accountFilter || e.accountId === accountFilter || !e.accountId)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal clone-modal"
        role="dialog"
        aria-label="Clone a repository"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="modal-header">
          <span>Clone a repository</span>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {accounts && accounts.length === 0 && (
            <div className="clone-hint">
              <span>
                Add a GitHub, GitLab, Bitbucket or Azure DevOps account to pick from your repositories here.
              </span>
              <button className="subtle" onClick={onOpenSettings}>
                Add an account…
              </button>
            </div>
          )}
          {accounts && accounts.length > 0 && (
            <>
              <div className="clone-search">
                <input
                  autoFocus
                  type="search"
                  aria-label="Search your repositories"
                  placeholder="Search your repositories"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches.length > 0) pick(matches[0])
                  }}
                />
                {showAccount && (
                  <Select
                    aria-label="Account"
                    className="clone-account"
                    value={accountFilter}
                    options={[
                      { value: '', label: 'All accounts' },
                      ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))
                    ]}
                    onChange={setAccountFilter}
                  />
                )}
              </div>
              <div className="clone-list" role="listbox" aria-label="Your repositories">
                {!list && <div className="clone-empty">Loading your repositories…</div>}
                {list && shown.length === 0 && (
                  <div className="clone-empty">
                    {inAccount.length === 0 ? 'No repositories found.' : `No repositories match "${query}".`}
                  </div>
                )}
                {shown.map((repo) => {
                  const account = accountById.get(repo.accountId)
                  const isSelected = !!selected && repoKey(selected) === repoKey(repo)
                  return (
                    <div
                      key={repoKey(repo)}
                      role="option"
                      aria-selected={isSelected}
                      className={`clone-repo${isSelected ? ' selected' : ''}`}
                      title={repo.webUrl ?? repo.cloneUrl}
                      onClick={() => pick(repo)}
                      onDoubleClick={() => clone(urlFor(repo, useSsh))}
                    >
                      <span className="clone-repo-name">
                        {repo.fullName}
                        {repo.private && <span className="clone-repo-private">Private</span>}
                      </span>
                      {(repo.description || (showAccount && account)) && (
                        <span className="clone-repo-detail">
                          {[showAccount && account ? accountLabel(account) : '', repo.description]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                  )
                })}
                {matches.length > SHOWN && (
                  <div className="clone-empty">
                    {matches.length - SHOWN} more. Search to narrow them down.
                  </div>
                )}
              </div>
              {errors.map((e) => {
                const account = accountById.get(e.accountId)
                return (
                  <div key={e.accountId} className="clone-error" role="alert">
                    {account ? `Couldn't list ${accountLabel(account)}: ` : "Couldn't list your repositories: "}
                    {e.message}
                  </div>
                )
              })}
            </>
          )}
          <label className="modal-label" htmlFor={`${ids}-url`}>
            Repository URL
          </label>
          <input
            id={`${ids}-url`}
            autoFocus
            value={url}
            placeholder="https://github.com/owner/repo.git"
            onChange={(e) => changeUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && clone()}
          />
          {selected?.sshUrl && (
            <label className="clone-ssh">
              <input type="checkbox" checked={useSsh} onChange={(e) => changeSsh(e.target.checked)} />
              Clone over SSH (uses your SSH key instead of the account's token)
            </label>
          )}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="commit-button" disabled={!url.trim()} onClick={() => clone()}>
            Choose folder…
          </button>
        </div>
      </div>
    </div>
  )
}
