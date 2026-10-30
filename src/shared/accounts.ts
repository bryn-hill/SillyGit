/** Services SillyGit can sign in to with a personal access token: git hosts, and Jira for issues. */
export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'gitea' | 'jira'

/** A signed-in account. The token itself never leaves the main process. */
export interface ProviderAccount {
  id: string
  provider: GitProvider
  /** e.g. "github.com", or a self-hosted GitHub Enterprise, GitLab or Gitea host. */
  host: string
  /** The account's login on the service. */
  username: string
  displayName: string
  /** The account's own avatar as a data: URL, saved when it was added. */
  avatar: string | null
  /** Email addresses the service reports for the account; their commits get its avatar. */
  emails: string[]
  addedAt: string
}

/** What the Settings form sends to add an account. */
export interface NewAccountInput {
  provider: GitProvider
  host: string
  /** Bitbucket and Jira Cloud: the Atlassian account email the API token belongs to. */
  username?: string
  token: string
}

export interface ProviderInfo {
  label: string
  defaultHost: string
  /** False for Bitbucket Cloud, which only lives at bitbucket.org. */
  hostEditable: boolean
  /** Bitbucket's API tokens are used together with the account's email. */
  needsUsername: boolean
  /** Jira: the email is asked for, but left out for a Data Center personal access token. */
  optionalUsername?: boolean
  /** An issue tracker, not a git host: git never gets its token. */
  issueTracker?: boolean
  /** Placeholder for the Server field. */
  hostPlaceholder?: string
  /** The page where the user creates a token, with the right scopes picked where the service allows it. */
  tokenUrl: (host: string) => string
  /** Which permissions the token needs, shown under the form. */
  scopesHint: string
}

export const PROVIDERS: Record<GitProvider, ProviderInfo> = {
  github: {
    label: 'GitHub',
    defaultHost: 'github.com',
    hostEditable: true,
    needsUsername: false,
    tokenUrl: (host) =>
      `https://${host}/settings/tokens/new?scopes=repo,read:user,user:email&description=SillyGit`,
    scopesHint: 'Classic token with repo, read:user and user:email, or a fine-grained token with Contents (read and write) and Pull requests access.'
  },
  gitlab: {
    label: 'GitLab',
    defaultHost: 'gitlab.com',
    hostEditable: true,
    needsUsername: false,
    tokenUrl: (host) =>
      `https://${host}/-/user_settings/personal_access_tokens?name=SillyGit&scopes=api,read_user,write_repository`,
    scopesHint: 'Scopes: read_user and write_repository (api to work with merge requests).'
  },
  bitbucket: {
    label: 'Bitbucket',
    defaultHost: 'bitbucket.org',
    hostEditable: false,
    needsUsername: true,
    tokenUrl: () => 'https://id.atlassian.com/manage-profile/security/api-tokens',
    scopesHint: 'An Atlassian API token with scopes, including read:user and read/write repository access.'
  },
  gitea: {
    label: 'Gitea / Forgejo',
    defaultHost: '',
    hostEditable: true,
    needsUsername: false,
    tokenUrl: (host) => `https://${host}/user/settings/applications`,
    scopesHint: 'Scopes: read:user and write:repository.'
  },
  jira: {
    label: 'Jira',
    defaultHost: '',
    hostEditable: true,
    needsUsername: false,
    optionalUsername: true,
    issueTracker: true,
    hostPlaceholder: 'your-site.atlassian.net',
    tokenUrl: (host) =>
      isJiraCloud(host)
        ? 'https://id.atlassian.com/manage-profile/security/api-tokens'
        : `https://${host}/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens`,
    scopesHint:
      'Jira Cloud: your Atlassian email and an API token (a classic one, or one with read:jira-work and read:jira-user). Jira Data Center: leave the email empty and use a personal access token.'
  }
}

export const PROVIDER_ORDER: GitProvider[] = ['github', 'gitlab', 'bitbucket', 'gitea', 'jira']

/** Jira Cloud sites live on atlassian.net; anything else is Jira Data Center or Server. */
export function isJiraCloud(host: string): boolean {
  return host === 'atlassian.net' || host.endsWith('.atlassian.net')
}

/**
 * Cleans up what the user typed as a host: drops a scheme, path, trailing
 * slash and case, so "https://GitHub.example.com/" becomes "github.example.com".
 */
export function normalizeHost(input: string): string {
  return input
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^[^@/]*@/, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
}

/** Where a remote lives, from its URL, e.g. git@github.com:owner/repo.git -> github.com, owner/repo. */
export function parseRemoteUrl(url: string): { host: string; path: string } | null {
  const trimmed = url.trim().replace(/\/$/, '').replace(/\.git$/, '')
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(trimmed)
  if (scp) return { host: scp[1].toLowerCase(), path: scp[2] }
  const parsed = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(trimmed)
  if (parsed) return { host: parsed[1].toLowerCase(), path: parsed[2] }
  return null
}

/** Guesses which service a host belongs to when no account says so. */
export function guessProvider(host: string): GitProvider | null {
  if (host === 'github.com' || host.startsWith('github.')) return 'github'
  if (host === 'gitlab.com' || host.startsWith('gitlab.')) return 'gitlab'
  if (host === 'bitbucket.org') return 'bitbucket'
  return null
}
