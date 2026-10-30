import { useEffect, useId, useState, type JSX } from 'react'
import type { ProviderAccount } from '../../../shared/accounts'
import {
  accountLabel,
  gitHostAccounts,
  repoNameProblem,
  suggestRepoName,
  type PublishOwner,
  type PublishResult
} from '../../../shared/hostedRepos'
import { repoDisplayName } from '../lib/repoName'
import Select from './Select'

interface Props {
  repoPath: string
  branch: string | null
  onPublished: (result: PublishResult) => void
  onOpenSettings: () => void
  onClose: () => void
}

const OWNER_NOUN: Partial<Record<ProviderAccount['provider'], string>> = {
  gitlab: 'Namespace',
  bitbucket: 'Workspace',
  azure: 'Project'
}

/**
 * For a repository with no remote: creates it on a signed-in host, adds it as
 * origin and pushes the checked-out branch.
 */
export default function PublishRepoDialog({ repoPath, branch, onPublished, onOpenSettings, onClose }: Props): JSX.Element {
  const ids = useId()
  const [accounts, setAccounts] = useState<ProviderAccount[] | null>(null)
  const [pickedAccount, setPickedAccount] = useState<string | null>(null)
  const account = accounts?.find((a) => a.id === pickedAccount) ?? accounts?.[0] ?? null
  const accountId = account?.id ?? null
  // Owners as loaded for an account, so switching accounts never shows the last one's.
  const [owners, setOwners] = useState<{ accountId: string; owners: PublishOwner[] | null; error: string | null } | null>(
    null
  )
  const shownOwners = owners && owners.accountId === accountId ? owners : null
  const [pickedOwner, setPickedOwner] = useState<string | null>(null)
  const owner =
    shownOwners?.owners?.find((o) => o.id === pickedOwner) ?? shownOwners?.owners?.[0] ?? null
  const [name, setName] = useState(() => suggestRepoName(repoDisplayName(repoPath)))
  const [description, setDescription] = useState('')
  const [isPrivate, setPrivate] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    window.api.listAccounts().then((res) => {
      if (current) setAccounts(res.ok ? gitHostAccounts(res.data) : [])
    })
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    if (!accountId) return
    let current = true
    window.api.publishOwners(accountId).then((res) => {
      if (!current) return
      setOwners(res.ok ? { accountId, owners: res.data, error: null } : { accountId, owners: null, error: res.error })
    })
    return () => {
      current = false
    }
  }, [accountId])

  const nameProblem = repoNameProblem(name)
  const ownerNoun = (account && OWNER_NOUN[account.provider]) ?? 'Owner'
  const problem = !account
    ? 'Add an account first.'
    : !branch
      ? 'Check out a branch to publish.'
      : nameProblem ?? (!owner ? (shownOwners ? `There's no ${ownerNoun.toLowerCase()} to create it in.` : 'Loading…') : null)

  const publish = async (): Promise<void> => {
    if (problem || !account || !owner) return
    setError(null)
    setPublishing(true)
    const res = await window.api.publishRepo(repoPath, {
      accountId: account.id,
      owner: owner.id,
      name,
      description,
      private: isPrivate
    })
    setPublishing(false)
    if (res.ok) onPublished(res.data)
    else setError(res.error)
  }

  return (
    <div className="modal-backdrop" onClick={() => !publishing && onClose()}>
      <div
        className="modal publish-modal"
        role="dialog"
        aria-label="Publish repository"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && !publishing && onClose()}
      >
        <div className="modal-header">
          <span>Publish repository</span>
          <button className="icon-button" onClick={onClose} title="Close" disabled={publishing}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {accounts && accounts.length === 0 ? (
            <div className="clone-hint">
              <span>
                Publishing creates the repository on GitHub, GitLab, Bitbucket, Azure DevOps or Gitea. Add an account
                for one of them first.
              </span>
              <button className="subtle" onClick={onOpenSettings}>
                Add an account…
              </button>
            </div>
          ) : (
            <>
              <p className="publish-intro">
                Creates a new repository, adds it as <code>origin</code> and pushes{' '}
                {branch ? <code>{branch}</code> : 'the checked-out branch'} to it.
              </p>
              <div className="publish-row">
                <div className="publish-field">
                  <label className="modal-label" htmlFor={`${ids}-account`}>
                    Account
                  </label>
                  <Select
                    id={`${ids}-account`}
                    value={accountId ?? ''}
                    options={(accounts ?? []).map((a) => ({ value: a.id, label: accountLabel(a) }))}
                    onChange={(id) => {
                      setPickedAccount(id)
                      setPickedOwner(null)
                    }}
                    disabled={publishing || !accounts}
                  />
                </div>
                <div className="publish-field">
                  <label className="modal-label" htmlFor={`${ids}-owner`}>
                    {ownerNoun}
                  </label>
                  <Select
                    id={`${ids}-owner`}
                    value={owner?.id ?? ''}
                    options={
                      shownOwners?.owners?.map((o) => ({ value: o.id, label: o.label })) ?? [
                        { value: '', label: shownOwners?.error ? 'Couldn\'t load' : 'Loading…' }
                      ]
                    }
                    onChange={setPickedOwner}
                    disabled={publishing || !shownOwners?.owners?.length}
                  />
                </div>
              </div>
              <label className="modal-label" htmlFor={`${ids}-name`}>
                Name
              </label>
              <input
                id={`${ids}-name`}
                autoFocus
                value={name}
                disabled={publishing}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void publish()}
              />
              {name && nameProblem && <div className="publish-problem">{nameProblem}</div>}
              <label className="modal-label" htmlFor={`${ids}-description`}>
                Description
              </label>
              <input
                id={`${ids}-description`}
                value={description}
                disabled={publishing}
                placeholder="Optional"
                onChange={(e) => setDescription(e.target.value)}
              />
              {account?.provider !== 'azure' && (
                <label className="publish-private">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    disabled={publishing}
                    onChange={(e) => setPrivate(e.target.checked)}
                  />
                  Private (only people you give access can see it)
                </label>
              )}
              {shownOwners?.error && (
                <div className="modal-error" role="alert">
                  {shownOwners.error}
                </div>
              )}
              {error && (
                <div className="modal-error" role="alert">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onClose} disabled={publishing}>
            Cancel
          </button>
          <button
            className="commit-button"
            disabled={publishing || !!problem}
            title={problem ?? undefined}
            onClick={() => void publish()}
          >
            {publishing ? 'Publishing…' : 'Publish repository'}
          </button>
        </div>
      </div>
    </div>
  )
}
