import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GithubAccess } from './hosting'

// A signed-in account for /repo; the GitHub API itself is a fake fetch.
const fake = vi.hoisted(() => ({ access: null as GithubAccess | null }))

vi.mock('./hosting', () => ({
  githubAccess: async () => fake.access,
  azureAccess: async () => null,
  remoteLocations: async () => []
}))

import { setFetch } from './http'
import { addComment, getPullRequestDetail, getPullRequestHead, replyToThread, setThreadResolved, submitReview, toCheck } from './prReview'

interface Call {
  url: string
  method: string
  body: unknown
  auth: string | undefined
}

let calls: Call[] = []
let respond: (call: Call) => { status?: number; json: unknown } = () => ({ json: {} })

beforeEach(() => {
  calls = []
  fake.access = {
    repo: { host: 'github.com', owner: 'bryn', name: 'app' },
    creds: { provider: 'github', host: 'github.com', token: 't0ken' },
    account: {
      id: 'a1',
      provider: 'github',
      host: 'github.com',
      username: 'bryn',
      displayName: 'Bryn',
      avatar: null,
      emails: [],
      addedAt: '2026-10-01T00:00:00Z'
    }
  }
  setFetch(async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: (init?.headers as Record<string, string>)?.Authorization
    }
    calls.push(call)
    const { status = 200, json } = respond(call)
    return new Response(JSON.stringify(json), { status, statusText: status === 200 ? 'OK' : 'Error' })
  })
})

const gqlPr = {
  number: 7,
  title: 'Add login page',
  body: 'Adds the page.\n\nCloses #3',
  url: 'https://github.com/bryn/app/pull/7',
  state: 'OPEN',
  isDraft: false,
  headRefName: 'junior/login',
  baseRefName: 'main',
  headRefOid: 'abc123',
  mergeable: 'MERGEABLE',
  reviewDecision: 'REVIEW_REQUIRED',
  additions: 12,
  deletions: 3,
  createdAt: '2026-10-27T09:00:00Z',
  author: { login: 'junior' },
  commits: {
    nodes: [
      {
        commit: {
          statusCheckRollup: {
            contexts: {
              nodes: [
                { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://ci/1', title: '2 failed' },
                { __typename: 'StatusContext', context: 'lint', state: 'SUCCESS', targetUrl: null, description: 'ok' },
                {}
              ]
            }
          }
        }
      }
    ]
  },
  reviews: {
    nodes: [
      { id: 'R1', author: { login: 'carol' }, state: 'COMMENTED', body: 'Looks close', submittedAt: '2026-10-27T10:00:00Z' },
      { id: 'R2', author: { login: 'bryn' }, state: 'PENDING', body: '', submittedAt: null }
    ]
  },
  comments: { nodes: [{ id: 'C1', author: null, body: 'ping', createdAt: '2026-10-27T11:00:00Z' }] },
  reviewThreads: {
    nodes: [
      {
        id: 'T1',
        path: 'src/login.ts',
        line: 4,
        startLine: null,
        diffSide: 'RIGHT',
        isResolved: false,
        isOutdated: false,
        comments: { nodes: [{ id: 'TC1', author: { login: 'carol' }, body: 'Rename this', createdAt: '2026-10-27T10:00:00Z', diffHunk: '@@ -1 +1 @@' }] }
      }
    ]
  }
}

function restFile(i: number): Record<string, unknown> {
  return { filename: `f${i}.ts`, status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1,2 @@\n a\n+b' }
}

describe('getPullRequestDetail', () => {
  it('combines the GraphQL pull request with its REST file list', async () => {
    respond = (c) =>
      c.url.endsWith('/graphql')
        ? { json: { data: { viewer: { login: 'bryn' }, repository: { pullRequest: gqlPr } } } }
        : { json: [{ filename: 'src/login.ts', status: 'added', additions: 12, deletions: 0, patch: '@@ -0,0 +1 @@\n+x' }, { filename: 'logo.png', previous_filename: 'old.png', status: 'renamed', additions: 0, deletions: 0 }] }

    const d = await getPullRequestDetail('/repo', 7)

    expect(calls.every((c) => c.auth === 'Bearer t0ken')).toBe(true)
    const gql = calls.find((c) => c.url.endsWith('/graphql'))!
    expect(gql.body).toMatchObject({ variables: { owner: 'bryn', name: 'app', number: 7 } })
    expect(calls.find((c) => !c.url.endsWith('/graphql'))!.url).toBe(
      'https://api.github.com/repos/bryn/app/pulls/7/files?per_page=100&page=1'
    )
    expect(d).toMatchObject({
      number: 7,
      title: 'Add login page',
      author: 'junior',
      viewer: 'bryn',
      headSha: 'abc123',
      reviewDecision: 'REVIEW_REQUIRED'
    })
    expect(d.checks).toEqual([
      { name: 'test', state: 'failure', url: 'https://ci/1', description: '2 failed' },
      { name: 'lint', state: 'success', url: undefined, description: 'ok' }
    ])
    // The viewer's unsent web draft is left out.
    expect(d.reviews.map((r) => r.id)).toEqual(['R1'])
    expect(d.comments).toEqual([{ id: 'C1', author: 'ghost', body: 'ping', createdAt: '2026-10-27T11:00:00Z' }])
    expect(d.threads[0]).toMatchObject({ id: 'T1', path: 'src/login.ts', line: 4, side: 'RIGHT', diffHunk: '@@ -1 +1 @@' })
    expect(d.files).toEqual([
      { path: 'src/login.ts', status: 'added', additions: 12, deletions: 0, patch: '@@ -0,0 +1 @@\n+x' },
      { path: 'logo.png', previousPath: 'old.png', status: 'renamed', additions: 0, deletions: 0, patch: null }
    ])
  })

  it('pages through more than 100 files', async () => {
    respond = (c) => {
      if (c.url.endsWith('/graphql')) return { json: { data: { viewer: { login: 'bryn' }, repository: { pullRequest: gqlPr } } } }
      const page = Number(new URL(c.url).searchParams.get('page'))
      const count = page === 1 ? 100 : 30
      return { json: Array.from({ length: count }, (_, i) => restFile((page - 1) * 100 + i)) }
    }
    const d = await getPullRequestDetail('/repo', 7)
    expect(d.files).toHaveLength(130)
    expect(calls.filter((c) => c.url.includes('/files')).length).toBe(2)
  })

  it('says when the pull request does not exist', async () => {
    respond = (c) =>
      c.url.endsWith('/graphql') ? { json: { data: { viewer: { login: 'bryn' }, repository: { pullRequest: null } } } } : { json: [] }
    await expect(getPullRequestDetail('/repo', 99)).rejects.toThrow("Pull request #99 wasn't found in bryn/app.")
  })

  it('explains a rejected token', async () => {
    respond = () => ({ status: 401, json: { message: 'Bad credentials' } })
    await expect(getPullRequestDetail('/repo', 7)).rejects.toThrow(
      'github.com rejected the token for bryn. Add it again in Settings.'
    )
  })

  it("uses the Enterprise host's API", async () => {
    fake.access!.repo.host = 'git.corp.com'
    fake.access!.creds.host = 'git.corp.com'
    respond = (c) =>
      c.url.endsWith('/graphql') ? { json: { data: { viewer: { login: 'bryn' }, repository: { pullRequest: gqlPr } } } } : { json: [] }
    await getPullRequestDetail('/repo', 7)
    expect(calls.map((c) => c.url).sort()).toEqual([
      'https://git.corp.com/api/graphql',
      'https://git.corp.com/api/v3/repos/bryn/app/pulls/7/files?per_page=100&page=1'
    ])
  })
})

describe('writes', () => {
  beforeEach(() => {
    respond = () => ({ json: { data: {} } })
  })

  it('submits a review with its line comments in one request', async () => {
    await submitReview('/repo', 7, {
      headSha: 'abc123',
      event: 'REQUEST_CHANGES',
      body: 'A few things',
      comments: [
        { id: 'd1', path: 'src/a.ts', line: 10, side: 'RIGHT', body: 'Typo' },
        { id: 'd2', path: 'src/a.ts', line: 14, startLine: 12, side: 'LEFT', body: 'Why remove these?' }
      ]
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/bryn/app/pulls/7/reviews',
      body: {
        commit_id: 'abc123',
        event: 'REQUEST_CHANGES',
        body: 'A few things',
        comments: [
          { path: 'src/a.ts', line: 10, side: 'RIGHT', body: 'Typo' },
          { path: 'src/a.ts', line: 14, side: 'LEFT', start_line: 12, start_side: 'LEFT', body: 'Why remove these?' }
        ]
      }
    })
  })

  it('leaves out an empty summary (approving with no words)', async () => {
    await submitReview('/repo', 7, { headSha: 'abc', event: 'APPROVE', body: '  ', comments: [] })
    expect(calls[0].body).toEqual({ commit_id: 'abc', event: 'APPROVE', comments: [] })
  })

  it('passes on GitHub’s reason when a review is refused', async () => {
    respond = () => ({ status: 422, json: { message: 'Can not approve your own pull request' } })
    await expect(submitReview('/repo', 7, { headSha: 'abc', event: 'APPROVE', body: '', comments: [] })).rejects.toThrow(
      'Can not approve your own pull request'
    )
  })

  it('adds a conversation comment', async () => {
    await addComment('/repo', 7, 'Nice work')
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/bryn/app/issues/7/comments',
      body: { body: 'Nice work' }
    })
  })

  it('replies to and resolves threads through GraphQL', async () => {
    await replyToThread('/repo', 'T1', 'Done')
    await setThreadResolved('/repo', 'T1', true)
    await setThreadResolved('/repo', 'T1', false)
    expect(calls.map((c) => (c.body as { variables: unknown }).variables)).toEqual([
      { id: 'T1', body: 'Done' },
      { id: 'T1' },
      { id: 'T1' }
    ])
    const queries = calls.map((c) => (c.body as { query: string }).query)
    expect(queries[0]).toContain('addPullRequestReviewThreadReply')
    expect(queries[1]).toContain('resolveReviewThread')
    expect(queries[2]).toContain('unresolveReviewThread')
  })
})

describe('toCheck', () => {
  it.each([
    [{ status: 'IN_PROGRESS', conclusion: null }, 'pending'],
    [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, 'success'],
    [{ status: 'COMPLETED', conclusion: 'NEUTRAL' }, 'neutral'],
    [{ status: 'COMPLETED', conclusion: 'SKIPPED' }, 'skipped'],
    [{ status: 'COMPLETED', conclusion: 'TIMED_OUT' }, 'failure']
  ])('maps check run %o to %s', (run, state) => {
    expect(toCheck({ __typename: 'CheckRun', name: 'x', detailsUrl: null, title: null, ...run }).state).toBe(state)
  })

  it.each([
    ['SUCCESS', 'success'],
    ['ERROR', 'failure'],
    ['EXPECTED', 'pending']
  ])('maps commit status %s to %s', (s, state) => {
    expect(toCheck({ __typename: 'StatusContext', context: 'ci', state: s, targetUrl: null, description: null }).state).toBe(state)
  })
})

describe('getPullRequestHead', () => {
  it('reads the head branch and repositories from the REST pull request', async () => {
    respond = () => ({
      json: {
        head: { ref: 'main', repo: { name: 'app-fork', owner: { login: 'junior' } } },
        base: { repo: { name: 'app', owner: { login: 'bryn' } } }
      }
    })
    expect(await getPullRequestHead('/repo', 9)).toEqual({
      number: 9,
      host: 'github.com',
      baseRepo: { owner: 'bryn', name: 'app' },
      headRepo: { owner: 'junior', name: 'app-fork' },
      headRefName: 'main'
    })
    expect(calls[0].url).toBe('https://api.github.com/repos/bryn/app/pulls/9')
  })

  it('has no head repository once the fork is deleted', async () => {
    respond = () => ({ json: { head: { ref: 'fix', repo: null }, base: { repo: { name: 'app', owner: { login: 'bryn' } } } } })
    expect((await getPullRequestHead('/repo', 3)).headRepo).toBeNull()
  })
})
