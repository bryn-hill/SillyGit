import { isJiraCloud } from '../shared/accounts'
import { jiraIssueUrl, type JiraIssue, type JiraIssues, type JiraSite } from '../shared/jira'
import { accountsWithCredentials } from './accounts'
import { HttpError, fetchJson } from './http'
import { apiBase, authHeaders, type Credentials } from './providerApi'

// Jira Cloud (REST v3, email + API token) and Jira Data Center (REST v2,
// personal access token): the issues assigned to the user for Launchpad, and
// each site's project keys so issue keys elsewhere in the app can link to it.

const ISSUE_FIELDS = ['summary', 'status', 'issuetype', 'priority', 'updated']
const MAX_ISSUES = 50
/** Unresolved issues assigned to the user, the ones they touched last first. */
export const ASSIGNED_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'

interface RawIssue {
  key: string
  fields: {
    summary?: string
    status?: { name?: string; statusCategory?: { key?: string } }
    issuetype?: { name?: string } | null
    priority?: { name?: string } | null
    updated?: string
  }
}

function toIssue(raw: RawIssue, host: string): JiraIssue {
  const category = raw.fields.status?.statusCategory?.key
  return {
    key: raw.key,
    summary: raw.fields.summary ?? raw.key,
    url: jiraIssueUrl(host, raw.key),
    host,
    status: raw.fields.status?.name ?? '',
    statusCategory: category === 'indeterminate' || category === 'done' ? category : 'new',
    type: raw.fields.issuetype?.name ?? null,
    priority: raw.fields.priority?.name ?? null,
    updatedAt: raw.fields.updated ?? ''
  }
}

/** The issues `jql` finds on one site, up to 50. */
export async function searchIssues(creds: Credentials, jql = ASSIGNED_JQL): Promise<JiraIssue[]> {
  const base = apiBase('jira', creds.host)
  // Cloud retired /search for /search/jql; Data Center only has /search.
  const url = isJiraCloud(creds.host) ? `${base}/search/jql` : `${base}/search`
  const res = await fetchJson<{ issues?: RawIssue[] }>(url, {
    method: 'POST',
    headers: { ...authHeaders(creds), 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql, fields: ISSUE_FIELDS, maxResults: MAX_ISSUES })
  })
  return (res.issues ?? []).map((i) => toIssue(i, creds.host))
}

/** Every project key the account can see on its site. */
export async function projectKeys(creds: Credentials): Promise<string[]> {
  const base = apiBase('jira', creds.host)
  const headers = authHeaders(creds)
  if (!isJiraCloud(creds.host)) {
    return (await fetchJson<{ key: string }[]>(`${base}/project`, { headers })).map((p) => p.key)
  }
  const keys: string[] = []
  // Paged; a few hundred projects is already a big site.
  for (let startAt = 0; startAt < 1000; ) {
    const page = await fetchJson<{ values?: { key: string }[]; isLast?: boolean }>(
      `${base}/project/search?startAt=${startAt}&maxResults=100`,
      { headers }
    )
    const values = page.values ?? []
    keys.push(...values.map((p) => p.key))
    if (page.isLast !== false || values.length === 0) break
    startAt += values.length
  }
  return keys
}

function problemMessage(err: unknown, host: string, username: string): string {
  if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
    return `${host} rejected the token for ${username}. Add it again in Settings.`
  }
  return err instanceof Error ? err.message : String(err)
}

/** Open issues assigned to the user on every signed-in Jira site, the most recently updated first. */
export async function assignedJiraIssues(): Promise<JiraIssues> {
  const accounts = await accountsWithCredentials('jira')
  if (accounts.length === 0) return { connected: false, issues: [], problems: [] }
  const results = await Promise.all(
    accounts.map(({ account, creds }) =>
      searchIssues(creds).then(
        (issues) => ({ issues }),
        (err: unknown) => ({ problem: { host: account.host, message: problemMessage(err, account.host, account.username) } })
      )
    )
  )
  return {
    connected: true,
    issues: results
      .flatMap((r) => ('issues' in r ? r.issues : []))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    problems: results.flatMap((r) => ('problem' in r ? [r.problem] : []))
  }
}

const SITE_TTL_MS = 10 * 60 * 1000
const siteCache = new Map<string, { keys: string[]; at: number }>()

/**
 * Each signed-in Jira site with its project keys, kept for ten minutes. A
 * site that can't be reached keeps the keys it last had.
 */
export async function jiraSites(): Promise<JiraSite[]> {
  const accounts = await accountsWithCredentials('jira')
  return Promise.all(
    accounts.map(async ({ creds }) => {
      const cached = siteCache.get(creds.host)
      if (cached && Date.now() - cached.at < SITE_TTL_MS) return { host: creds.host, projectKeys: cached.keys }
      try {
        const keys = await projectKeys(creds)
        siteCache.set(creds.host, { keys, at: Date.now() })
        return { host: creds.host, projectKeys: keys }
      } catch {
        return { host: creds.host, projectKeys: cached?.keys ?? [] }
      }
    })
  )
}

/** Forgets the project keys, e.g. after a Jira account is added or removed. */
export function forgetJiraSites(): void {
  siteCache.clear()
}
