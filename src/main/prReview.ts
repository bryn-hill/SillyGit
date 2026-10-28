import { spawn } from 'child_process'
import * as github from './github'
import { githubAccess, remoteLocations } from './hosting'
import { fetchJson, HttpError } from './http'
import { apiBase, authHeaders } from './providerApi'
import type {
  PrCheck,
  PrCheckState,
  PrComment,
  PrFile,
  PrFileStatus,
  PrReviewState,
  PrReviewThread,
  PullRequestDetail,
  SubmitReviewInput
} from '../shared/prReview'

/**
 * How requests reach GitHub: the API with a signed-in account's token, or
 * else the gh CLI (`gh api`), which uses whatever `gh auth login` set up.
 */
interface GithubTransport {
  repo: github.GithubRepo
  rest<T>(method: string, path: string, body?: unknown): Promise<T>
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>
}

function ghApi(cwd: string, host: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', ['api', '--hostname', host, ...args, ...(input !== undefined ? ['--input', '-'] : [])], {
      cwd
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e: NodeJS.ErrnoException) =>
      reject(
        e.code === 'ENOENT'
          ? new Error('Add a GitHub token in Settings (or install the GitHub CLI) to review pull requests.')
          : e
      )
    )
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `gh exited with ${code}`))))
    child.stdin.end(input ?? '')
  })
}

async function transportFor(repoPath: string): Promise<GithubTransport> {
  const access = await githubAccess(repoPath)
  if (access) {
    const { creds, repo, account } = access
    const explain = (err: unknown): never => {
      if (err instanceof HttpError && err.status === 401)
        throw new Error(`${repo.host} rejected the token for ${account.username}. Add it again in Settings.`)
      throw err
    }
    return {
      repo,
      rest: (method, path, body) =>
        fetchJson<never>(`${apiBase('github', repo.host)}/${path}`, {
          method,
          headers: { ...authHeaders(creds), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        }).catch(explain),
      graphql: (query, variables) => github.graphql<never>(creds, query, variables).catch(explain)
    }
  }
  const loc = (await remoteLocations(repoPath)).find((l) => github.toGithubRepo(l.host, l.path))
  const repo = loc && github.toGithubRepo(loc.host, loc.path)
  if (!repo) throw new Error("This repository's remote isn't on GitHub.")
  return {
    repo,
    rest: async (method, path, body) => {
      const out = await ghApi(
        repoPath,
        repo.host,
        ['--method', method, path],
        body !== undefined ? JSON.stringify(body) : undefined
      )
      return (out.trim() ? JSON.parse(out) : undefined) as never
    },
    graphql: async (query, variables) => {
      const out = JSON.parse(await ghApi(repoPath, repo.host, ['graphql'], JSON.stringify({ query, variables })))
      if (out.errors?.length && !out.data) throw new Error(out.errors.map((e: { message: string }) => e.message).join('; '))
      return out.data as never
    }
  }
}

const DETAIL_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number title body url state isDraft headRefName baseRefName headRefOid mergeable reviewDecision
      additions deletions createdAt
      author { login }
      commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes {
        __typename
        ... on CheckRun { name status conclusion detailsUrl title }
        ... on StatusContext { context state targetUrl description }
      } } } } } }
      reviews(last: 50) { nodes { id author { login } state body submittedAt } }
      comments(last: 100) { nodes { id author { login } body createdAt } }
      reviewThreads(first: 100) { nodes {
        id path line startLine diffSide isResolved isOutdated
        comments(first: 50) { nodes { id author { login } body createdAt diffHunk } }
      } }
    }
  }
}`

type Login = { login: string } | null

interface GqlComment {
  id: string
  author: Login
  body: string
  createdAt: string
  diffHunk?: string
}

type GqlContext =
  | { __typename: 'CheckRun'; name: string; status: string; conclusion: string | null; detailsUrl: string | null; title: string | null }
  | { __typename: 'StatusContext'; context: string; state: string; targetUrl: string | null; description: string | null }

interface GqlPullRequest {
  number: number
  title: string
  body: string
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  headRefName: string
  baseRefName: string
  headRefOid: string
  mergeable: string
  reviewDecision: string | null
  additions: number
  deletions: number
  createdAt: string
  author: Login
  commits: { nodes: { commit: { statusCheckRollup: { contexts: { nodes: (GqlContext | Record<string, never>)[] } } | null } }[] }
  reviews: { nodes: { id: string; author: Login; state: PrReviewState; body: string; submittedAt: string | null }[] }
  comments: { nodes: GqlComment[] }
  reviewThreads: {
    nodes: {
      id: string
      path: string
      line: number | null
      startLine: number | null
      diffSide: 'LEFT' | 'RIGHT'
      isResolved: boolean
      isOutdated: boolean
      comments: { nodes: GqlComment[] }
    }[]
  }
}

const loginOf = (a: Login): string => a?.login ?? 'ghost'

function toComment(c: GqlComment): PrComment {
  return { id: c.id, author: loginOf(c.author), body: c.body, createdAt: c.createdAt }
}

export function toCheck(c: GqlContext): PrCheck {
  if (c.__typename === 'StatusContext') {
    const state: PrCheckState =
      c.state === 'SUCCESS' ? 'success' : c.state === 'FAILURE' || c.state === 'ERROR' ? 'failure' : 'pending'
    return { name: c.context, state, url: c.targetUrl ?? undefined, description: c.description ?? undefined }
  }
  let state: PrCheckState
  if (c.status !== 'COMPLETED') state = 'pending'
  else if (c.conclusion === 'SUCCESS') state = 'success'
  else if (c.conclusion === 'NEUTRAL') state = 'neutral'
  else if (c.conclusion === 'SKIPPED' || c.conclusion === 'STALE') state = 'skipped'
  else state = 'failure'
  return { name: c.name, state, url: c.detailsUrl ?? undefined, description: c.title ?? undefined }
}

interface RestFile {
  filename: string
  previous_filename?: string
  status: PrFileStatus
  additions: number
  deletions: number
  patch?: string
}

// GitHub lists at most 3000 files for a pull request.
const FILES_PER_PAGE = 100
const MAX_FILE_PAGES = 30

async function listFiles(t: GithubTransport, number: number): Promise<PrFile[]> {
  const files: PrFile[] = []
  for (let page = 1; page <= MAX_FILE_PAGES; page++) {
    const batch = await t.rest<RestFile[]>(
      'GET',
      `repos/${t.repo.owner}/${t.repo.name}/pulls/${number}/files?per_page=${FILES_PER_PAGE}&page=${page}`
    )
    for (const f of batch)
      files.push({
        path: f.filename,
        ...(f.previous_filename ? { previousPath: f.previous_filename } : {}),
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null
      })
    if (batch.length < FILES_PER_PAGE) break
  }
  return files
}

/** Everything the review screen shows for one pull request. */
export async function getPullRequestDetail(repoPath: string, number: number): Promise<PullRequestDetail> {
  const t = await transportFor(repoPath)
  const [data, files] = await Promise.all([
    t.graphql<{ viewer: { login: string }; repository: { pullRequest: GqlPullRequest | null } | null }>(DETAIL_QUERY, {
      owner: t.repo.owner,
      name: t.repo.name,
      number
    }),
    listFiles(t, number)
  ])
  const pr = data.repository?.pullRequest
  if (!pr) throw new Error(`Pull request #${number} wasn't found in ${t.repo.owner}/${t.repo.name}.`)
  const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []
  return {
    repoPath,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    url: pr.url,
    author: loginOf(pr.author),
    state: pr.state,
    isDraft: pr.isDraft,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    headSha: pr.headRefOid,
    mergeable: pr.mergeable,
    reviewDecision: pr.reviewDecision ?? '',
    additions: pr.additions,
    deletions: pr.deletions,
    createdAt: pr.createdAt,
    viewer: data.viewer.login,
    checks: contexts.filter((c): c is GqlContext => '__typename' in c).map(toCheck),
    // A PENDING review is the viewer's own unsent draft from the website; it isn't part of the conversation yet.
    reviews: pr.reviews.nodes
      .filter((r) => r.state !== 'PENDING')
      .map((r) => ({
        id: r.id,
        author: loginOf(r.author),
        state: r.state,
        body: r.body,
        submittedAt: r.submittedAt ?? ''
      })),
    comments: pr.comments.nodes.map(toComment),
    threads: pr.reviewThreads.nodes.map(
      (th): PrReviewThread => ({
        id: th.id,
        path: th.path,
        line: th.line,
        startLine: th.startLine,
        side: th.diffSide,
        isResolved: th.isResolved,
        isOutdated: th.isOutdated,
        diffHunk: th.comments.nodes[0]?.diffHunk,
        comments: th.comments.nodes.map(toComment)
      })
    ),
    files
  }
}

/** Sends a review: its verdict, summary and every drafted line comment, in one go. */
export async function submitReview(repoPath: string, number: number, input: SubmitReviewInput): Promise<void> {
  const t = await transportFor(repoPath)
  await t.rest('POST', `repos/${t.repo.owner}/${t.repo.name}/pulls/${number}/reviews`, {
    commit_id: input.headSha,
    event: input.event,
    ...(input.body.trim() ? { body: input.body } : {}),
    comments: input.comments.map((c) => ({
      path: c.path,
      body: c.body,
      line: c.line,
      side: c.side,
      ...(c.startLine != null && c.startLine < c.line ? { start_line: c.startLine, start_side: c.side } : {})
    }))
  })
}

/** Adds a comment to the pull request's conversation. */
export async function addComment(repoPath: string, number: number, body: string): Promise<void> {
  const t = await transportFor(repoPath)
  await t.rest('POST', `repos/${t.repo.owner}/${t.repo.name}/issues/${number}/comments`, { body })
}

export async function replyToThread(repoPath: string, threadId: string, body: string): Promise<void> {
  const t = await transportFor(repoPath)
  await t.graphql(
    `mutation($id: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $id, body: $body }) { comment { id } }
    }`,
    { id: threadId, body }
  )
}

export async function setThreadResolved(repoPath: string, threadId: string, resolved: boolean): Promise<void> {
  const t = await transportFor(repoPath)
  const mutation = resolved ? 'resolveReviewThread' : 'unresolveReviewThread'
  await t.graphql(`mutation($id: ID!) { ${mutation}(input: { threadId: $id }) { thread { id } } }`, { id: threadId })
}
