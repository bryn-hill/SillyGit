import { PROVIDERS, type GitProvider, type ProviderAccount } from './accounts'

/** A repository a signed-in account can reach on its host, as the clone dialog lists it. */
export interface HostedRepo {
  accountId: string
  provider: GitProvider
  host: string
  /** "owner/name", or "project/name" on Azure DevOps. */
  fullName: string
  description: string
  private: boolean
  /** HTTPS clone URL with no user name in it: the account's token is sent by header. */
  cloneUrl: string
  sshUrl: string | null
  webUrl: string | null
  /** When it last changed, if the service says. */
  updatedAt: string | null
}

export interface HostedRepoList {
  repos: HostedRepo[]
  /** Accounts whose repositories couldn't be listed, e.g. an expired token. */
  errors: { accountId: string; message: string }[]
}

/** Where a new repository can be created for an account: the user, an organization, a group, a workspace or a project. */
export interface PublishOwner {
  id: string
  label: string
}

export interface PublishInput {
  accountId: string
  /** A PublishOwner id. */
  owner: string
  name: string
  description: string
  private: boolean
}

export interface PublishResult {
  remote: string
  branch: string
  cloneUrl: string
  webUrl: string | null
}

/** The remote a published repository is added as. */
export const PUBLISH_REMOTE = 'origin'

/** Accounts that host git repositories (Jira only tracks issues). */
export function gitHostAccounts(accounts: ProviderAccount[]): ProviderAccount[] {
  return accounts.filter((a) => !PROVIDERS[a.provider]?.issueTracker)
}

/** How an account is shown in the clone and publish dialogs, e.g. "GitHub · octocat". */
export function accountLabel(account: ProviderAccount): string {
  const service = PROVIDERS[account.provider]?.label ?? account.provider
  const host = account.host !== PROVIDERS[account.provider]?.defaultHost ? ` (${account.host})` : ''
  const who = account.provider === 'azure' && account.organization ? account.organization : account.username
  return `${service}${host} · ${who}`
}

/** Drops "user@" (or "user:pass@") from an HTTPS URL; the token goes in a header instead. */
export function withoutUserInfo(url: string): string {
  return url.replace(/^(https?:\/\/)[^@/]*@/i, '$1')
}

/** Repos whose name or description has every word of `query`, in their original order. */
export function filterHostedRepos(repos: HostedRepo[], query: string): HostedRepo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return repos
  return repos.filter((r) => {
    const text = `${r.fullName} ${r.description}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

/** Most recently changed first; repos with no date keep their order, after the dated ones. */
export function sortHostedRepos(repos: HostedRepo[]): HostedRepo[] {
  return repos
    .map((repo, index) => ({ repo, index }))
    .sort((a, b) => {
      const ta = a.repo.updatedAt ?? ''
      const tb = b.repo.updatedAt ?? ''
      if (ta !== tb) return ta && tb ? tb.localeCompare(ta) : ta ? -1 : 1
      return a.index - b.index
    })
    .map((x) => x.repo)
}

/** A name every host accepts, from a folder name: "My App!" -> "My-App". */
export function suggestRepoName(folderName: string): string {
  return folderName
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|-+$/g, '')
}

/** Why `name` can't be used for a new repository, or null when it can. */
export function repoNameProblem(name: string): string | null {
  if (!name.trim()) return 'Enter a name for the repository.'
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return 'Use only letters, numbers, dots, dashes and underscores.'
  if (name === '.' || name === '..' || /\.git$/i.test(name)) return `"${name}" can't be used as a repository name.`
  if (name.length > 100) return 'Use a name of 100 characters or fewer.'
  return null
}
