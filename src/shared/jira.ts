import { slugify } from './issues'

// Jira issue keys ("PROJ-123") in branch names, commit messages and pull
// requests. Only keys of projects the signed-in Jira sites have count, so
// "UTF-8" or "SHA-256" in a message never turn into links.

/** `branch.<name>.<key>`: the Jira issue Start work began the branch from. */
export const JIRA_ISSUE_KEY = 'sillygit-jira-issue'

/** A Jira site and the project keys it has, for linking issue keys to it. */
export interface JiraSite {
  host: string
  projectKeys: string[]
}

/** An issue assigned to the user on one of their Jira sites. */
export interface JiraIssue {
  key: string
  summary: string
  /** The issue's page, https://<host>/browse/<key>. */
  url: string
  host: string
  status: string
  /** Jira's status category: to do, in progress or done. */
  statusCategory: 'new' | 'indeterminate' | 'done'
  type: string | null
  priority: string | null
  updatedAt: string
}

/** Jira issues for Launchpad, and the sites that couldn't be asked. */
export interface JiraIssues {
  /** False when no Jira account is signed in. */
  connected: boolean
  issues: JiraIssue[]
  problems: { host: string; message: string }[]
}

/** One piece of text with the issue keys in it marked. */
export type JiraTextPart = { text: string } | { text: string; key: string; url: string }

// A key: an upper-case project key, a dash and a number, not inside a longer word.
const KEY_PATTERN = /(?<![A-Za-z0-9_-])([A-Z][A-Z0-9_]+)-(\d+)(?![A-Za-z0-9_])/g

export function jiraIssueUrl(host: string, key: string): string {
  return `https://${host}/browse/${key}`
}

/** The site whose projects include `projectKey`, if any. */
function siteFor(sites: JiraSite[], projectKey: string): JiraSite | undefined {
  return sites.find((s) => s.projectKeys.includes(projectKey))
}

/** Every known issue key in `text`, once each, in order. */
export function findJiraKeys(text: string, sites: JiraSite[]): { key: string; url: string }[] {
  const found = new Map<string, string>()
  for (const part of splitJiraKeys(text, sites)) if ('key' in part) found.set(part.key, part.url)
  return [...found].map(([key, url]) => ({ key, url }))
}

/** Splits `text` around the issue keys of known projects, for showing them as links. */
export function splitJiraKeys(text: string, sites: JiraSite[]): JiraTextPart[] {
  if (sites.length === 0 || !text) return [{ text }]
  const parts: JiraTextPart[] = []
  let last = 0
  for (const match of text.matchAll(KEY_PATTERN)) {
    const site = siteFor(sites, match[1])
    if (!site) continue
    const start = match.index
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: match[0], key: match[0], url: jiraIssueUrl(site.host, match[0]) })
    last = start + match[0].length
  }
  if (last < text.length || parts.length === 0) parts.push({ text: text.slice(last) })
  return parts
}

/**
 * The issue a branch is named after: a known key in the name, matched
 * case-insensitively since branch names are often lower-cased
 * ("feature/proj-12-login" -> PROJ-12).
 */
export function jiraKeyInBranch(branch: string, sites: JiraSite[]): { key: string; url: string } | null {
  for (const match of branch.matchAll(/(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9_]+)-(\d+)(?![0-9])/g)) {
    const project = match[1].toUpperCase()
    const site = siteFor(sites, project)
    if (site) {
      const key = `${project}-${match[2]}`
      return { key, url: jiraIssueUrl(site.host, key) }
    }
  }
  return null
}

/** The branch Start work offers for a Jira issue, e.g. "PROJ-123-fix-safari-export". */
export function jiraBranchName(key: string, summary: string): string {
  const slug = slugify(summary)
  return slug ? `${key}-${slug}` : key
}

/** Puts the key in front of a pull request title, as Jira's development panel looks for it there. */
export function withJiraKeyInTitle(title: string, key: string): string {
  if (new RegExp(`(?<![A-Za-z0-9])${key}(?![0-9])`).test(title)) return title
  return title.trim() ? `${key}: ${title.trim()}` : key
}

/** Adds a link to the Jira issue at the end of a pull request body, unless it's already linked. */
export function withJiraLink(body: string, key: string, url: string): string {
  if (body.includes(url)) return body
  const trimmed = body.trimEnd()
  const line = `Jira: [${key}](${url})`
  return trimmed ? `${trimmed}\n\n${line}` : line
}
