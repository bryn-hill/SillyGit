import { fetchJson } from './http'
import { isJiraCloud, type GitProvider } from '../shared/accounts'
import { verifyAzureAccount } from './azure'

/** A token and what the service needs alongside it. */
export interface Credentials {
  provider: GitProvider
  host: string
  token: string
  /** Bitbucket and Jira Cloud: the Atlassian account email (or username) the token belongs to. */
  username?: string
  /** Azure DevOps: the organization the token was made in. */
  organization?: string
}

/** The REST API root for a host, e.g. github.com -> https://api.github.com. */
export function apiBase(provider: GitProvider, host: string): string {
  switch (provider) {
    case 'github':
      return host === 'github.com' ? 'https://api.github.com' : `https://${host}/api/v3`
    case 'gitlab':
      return `https://${host}/api/v4`
    case 'bitbucket':
      return 'https://api.bitbucket.org/2.0'
    case 'gitea':
      return `https://${host}/api/v1`
    case 'jira':
      // Data Center has no v3; v2 has everything SillyGit asks for.
      return `https://${host}/rest/api/${isJiraCloud(host) ? 3 : 2}`
    case 'azure':
      return `https://${host}`
  }
}

export function graphqlUrl(host: string): string {
  return host === 'github.com' ? 'https://api.github.com/graphql' : `https://${host}/api/graphql`
}

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
}

/** Headers that authenticate an API request with the token. */
export function authHeaders(creds: Credentials): Record<string, string> {
  switch (creds.provider) {
    case 'github':
      return { Authorization: `Bearer ${creds.token}`, 'X-GitHub-Api-Version': '2022-11-28' }
    case 'gitlab':
      return { 'PRIVATE-TOKEN': creds.token }
    case 'bitbucket':
      return { Authorization: basic(creds.username ?? '', creds.token) }
    case 'gitea':
      return { Authorization: `token ${creds.token}` }
    case 'jira':
      // Cloud API tokens go with the account email; Data Center tokens are bearer tokens.
      return creds.username ? { Authorization: basic(creds.username, creds.token) } : { Authorization: `Bearer ${creds.token}` }
    case 'azure':
      // Azure DevOps takes a PAT as the password of Basic auth, with any (here no) user name.
      return { Authorization: basic('', creds.token) }
  }
}

/**
 * The username git sends over HTTPS with the token. Bitbucket API tokens
 * used with an email address take a fixed username; every other service
 * accepts the account's own login.
 */
export function gitUsername(provider: GitProvider, login: string, enteredUsername?: string): string {
  if (provider === 'bitbucket' && enteredUsername?.includes('@')) return 'x-bitbucket-api-token-auth'
  return login
}

/** The `Authorization` header git sends to the host, so pushes and pulls use the token. */
export function gitAuthHeader(username: string, token: string): string {
  return `Authorization: ${basic(username, token)}`
}

export interface VerifiedAccount {
  username: string
  displayName: string
  avatarUrl: string | null
  /** Headers the avatar needs, for a service that only shows it to signed-in users (Azure DevOps). */
  avatarHeaders?: Record<string, string>
  emails: string[]
}

function uniqueEmails(list: (string | null | undefined)[]): string[] {
  return [...new Set(list.filter((e): e is string => !!e && e.includes('@')).map((e) => e.toLowerCase()))]
}

/**
 * Checks the token against the service and reads who it belongs to. Throws
 * with the service's message when the token is wrong or lacks access.
 */
export async function verifyAccount(creds: Credentials): Promise<VerifiedAccount> {
  const base = apiBase(creds.provider, creds.host)
  const headers = authHeaders(creds)

  switch (creds.provider) {
    case 'github': {
      const user = await fetchJson<{ login: string; name: string | null; avatar_url?: string; email?: string | null }>(
        `${base}/user`,
        { headers }
      )
      // Needs the user:email scope; a token without it still works for everything else.
      const emails = await fetchJson<{ email: string; verified: boolean }[]>(`${base}/user/emails`, { headers }).catch(
        () => []
      )
      return {
        username: user.login,
        displayName: user.name || user.login,
        avatarUrl: user.avatar_url ?? null,
        emails: uniqueEmails([user.email, ...emails.filter((e) => e.verified).map((e) => e.email)])
      }
    }
    case 'gitlab': {
      const user = await fetchJson<{
        username: string
        name?: string
        avatar_url?: string | null
        email?: string
        public_email?: string
        commit_email?: string
      }>(`${base}/user`, { headers })
      return {
        username: user.username,
        displayName: user.name || user.username,
        avatarUrl: user.avatar_url ?? null,
        emails: uniqueEmails([user.email, user.public_email, user.commit_email])
      }
    }
    case 'bitbucket': {
      const user = await fetchJson<{
        username?: string
        nickname?: string
        display_name?: string
        links?: { avatar?: { href?: string } }
      }>(`${base}/user`, { headers })
      const emails = await fetchJson<{ values?: { email: string; is_confirmed?: boolean }[] }>(
        `${base}/user/emails`,
        { headers }
      ).catch(() => ({ values: [] }))
      const login = user.username || user.nickname || creds.username || 'bitbucket'
      return {
        username: login,
        displayName: user.display_name || login,
        avatarUrl: user.links?.avatar?.href ?? null,
        emails: uniqueEmails([
          creds.username?.includes('@') ? creds.username : null,
          ...(emails.values ?? []).filter((e) => e.is_confirmed !== false).map((e) => e.email)
        ])
      }
    }
    case 'azure':
      return verifyAzureAccount(creds)
    case 'gitea': {
      const user = await fetchJson<{ login: string; full_name?: string; avatar_url?: string; email?: string }>(
        `${base}/user`,
        { headers }
      )
      return {
        username: user.login,
        displayName: user.full_name || user.login,
        avatarUrl: user.avatar_url ?? null,
        emails: uniqueEmails([user.email])
      }
    }
    case 'jira': {
      if (isJiraCloud(creds.host) && !creds.username) throw new Error('Jira Cloud needs the email your API token belongs to')
      const user = await fetchJson<{
        accountId?: string
        name?: string
        displayName?: string
        emailAddress?: string
        avatarUrls?: Record<string, string>
      }>(`${base}/myself`, { headers })
      const login = user.emailAddress || user.name || creds.username || user.accountId || 'jira'
      return {
        username: login,
        displayName: user.displayName || login,
        avatarUrl: user.avatarUrls?.['48x48'] ?? null,
        // Jira knows the account's email, but its commits get a git host's avatar, not Jira's.
        emails: []
      }
    }
  }
}

/**
 * The avatar a GitLab instance has for an email. GitLab answers with a
 * Gravatar link when none of its users has the email; that's left to the
 * Gravatar step, so only images GitLab hosts itself count.
 */
export async function gitlabAvatarUrl(host: string, email: string, creds?: Credentials): Promise<string | null> {
  const res = await fetchJson<{ avatar_url?: string | null }>(
    `${apiBase('gitlab', host)}/avatar?email=${encodeURIComponent(email)}&size=64`,
    { headers: creds ? authHeaders(creds) : {} }
  )
  const url = res.avatar_url
  if (!url) return null
  try {
    return new URL(url).host === host ? url : null
  } catch {
    return null
  }
}
