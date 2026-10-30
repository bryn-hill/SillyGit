import { fetchJson } from './http'
import { apiBase, authHeaders, graphqlUrl, type Credentials } from './providerApi'
import type { OpenPullRequest } from '../shared/types'

/** A repository on a GitHub host, e.g. github.com and bryn-hill/sillygit. */
export interface GithubRepo {
  host: string
  owner: string
  name: string
}

/** Splits "owner/name" (as parsed from a remote URL) into a GithubRepo. */
export function toGithubRepo(host: string, path: string): GithubRepo | null {
  const parts = path.split('/').filter(Boolean)
  if (parts.length !== 2) return null
  return { host, owner: parts[0], name: parts[1] }
}

export async function graphql<T>(creds: Credentials, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetchJson<{ data?: T; errors?: { message: string }[] }>(graphqlUrl(creds.host), {
    method: 'POST',
    headers: { ...authHeaders(creds), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  if (res.errors?.length && !res.data) throw new Error(res.errors.map((e) => e.message).join('; '))
  return res.data as T
}

/** The same shape `gh pr list --json` gives, so launchpad.ts classifies both the same way. */
export interface GhStylePullRequest {
  number: number
  title: string
  url: string
  author: { login: string }
  isDraft: boolean
  headRefName: string
  baseRefName: string
  mergeable: string
  reviewDecision: string
  reviewRequests: unknown[]
  reviews: { author?: { login?: string }; state?: string }[]
  statusCheckRollup: { state?: string }[]
  updatedAt: string
  additions: number
  deletions: number
}

interface GraphqlPullRequest {
  number: number
  title: string
  url: string
  author: { login: string } | null
  isDraft: boolean
  headRefName: string
  baseRefName: string
  mergeable: string
  reviewDecision: string | null
  reviewRequests: { totalCount: number }
  reviews: { nodes: { author: { login: string } | null; state: string }[] }
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] }
  updatedAt: string
  additions: number
  deletions: number
}

const PR_FRAGMENT = `
fragment pr on PullRequest {
  number title url author { login } isDraft headRefName baseRefName mergeable reviewDecision
  reviewRequests { totalCount }
  reviews(last: 30) { nodes { author { login } state } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  updatedAt additions deletions
}`

const LAUNCHPAD_QUERY = `
query($authored: String!, $requested: String!) {
  authored: search(query: $authored, type: ISSUE, first: 50) { nodes { ...pr } }
  requested: search(query: $requested, type: ISSUE, first: 50) { nodes { ...pr } }
}
${PR_FRAGMENT}`

export function toGhStyle(pr: GraphqlPullRequest): GhStylePullRequest {
  const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup?.state
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: { login: pr.author?.login ?? 'ghost' },
    isDraft: pr.isDraft,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    mergeable: pr.mergeable,
    reviewDecision: pr.reviewDecision ?? '',
    reviewRequests: new Array(pr.reviewRequests.totalCount).fill(null),
    reviews: pr.reviews.nodes.map((r) => ({ author: { login: r.author?.login }, state: r.state })),
    // The rollup's overall state stands in for gh's per-check list.
    statusCheckRollup: rollup ? [{ state: rollup === 'EXPECTED' ? 'PENDING' : rollup }] : [],
    updatedAt: pr.updatedAt,
    additions: pr.additions,
    deletions: pr.deletions
  }
}

/** Open pull requests in the repo that the token's user wrote, and ones waiting for their review. */
export async function launchpadPullRequests(
  creds: Credentials,
  repo: GithubRepo
): Promise<{ authored: GhStylePullRequest[]; reviewRequested: GhStylePullRequest[] }> {
  const scope = `repo:${repo.owner}/${repo.name} is:pr is:open`
  const data = await graphql<{
    authored: { nodes: (GraphqlPullRequest | Record<string, never>)[] }
    requested: { nodes: (GraphqlPullRequest | Record<string, never>)[] }
  }>(creds, LAUNCHPAD_QUERY, { authored: `${scope} author:@me`, requested: `${scope} review-requested:@me` })
  const prs = (nodes: (GraphqlPullRequest | Record<string, never>)[]): GhStylePullRequest[] =>
    nodes.filter((n): n is GraphqlPullRequest => 'number' in n).map(toGhStyle)
  return { authored: prs(data.authored.nodes), reviewRequested: prs(data.requested.nodes) }
}

export async function listOpenPullRequests(creds: Credentials, repo: GithubRepo): Promise<OpenPullRequest[]> {
  const pulls = await fetchJson<{ number: number; html_url: string; title: string; head: { ref: string } }[]>(
    `${apiBase('github', repo.host)}/repos/${repo.owner}/${repo.name}/pulls?state=open&per_page=100`,
    { headers: authHeaders(creds) }
  )
  return pulls.map((p) => ({ number: p.number, url: p.html_url, headRefName: p.head.ref, title: p.title }))
}

export async function mergePullRequest(creds: Credentials, repo: GithubRepo, number: number): Promise<void> {
  await fetchJson(`${apiBase('github', repo.host)}/repos/${repo.owner}/${repo.name}/pulls/${number}/merge`, {
    method: 'PUT',
    headers: { ...authHeaders(creds), 'Content-Type': 'application/json' },
    body: JSON.stringify({ merge_method: 'merge' })
  })
}

// GraphQL caps how much one query may ask for; this many commits stays well inside it.
const COMMITS_PER_QUERY = 50

/**
 * Avatar URLs of the GitHub users behind commit emails. GitHub links a
 * commit to a user by its email, so one commit per email is enough. Emails
 * with no GitHub user are left out.
 */
export async function commitAuthorAvatars(
  creds: Credentials,
  repo: GithubRepo,
  commits: { email: string; hash: string }[]
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  for (let i = 0; i < commits.length; i += COMMITS_PER_QUERY) {
    const batch = commits.slice(i, i + COMMITS_PER_QUERY)
    const fields = batch
      .map((c, j) => `c${j}: object(oid: "${c.hash.replace(/[^0-9a-f]/gi, '')}") { ... on Commit { author { user { avatarUrl(size: 64) } } } }`)
      .join('\n')
    const data = await graphql<{ repository: Record<string, { author?: { user?: { avatarUrl?: string } | null } } | null> | null }>(
      creds,
      `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
      { owner: repo.owner, name: repo.name }
    )
    if (!data?.repository) break
    batch.forEach((c, j) => {
      const url = data.repository?.[`c${j}`]?.author?.user?.avatarUrl
      if (url) found.set(c.email, url)
    })
  }
  return found
}
