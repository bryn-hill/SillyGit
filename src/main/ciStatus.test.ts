import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GithubAccess } from './hosting'

// A signed-in GitHub account for /repo; the API itself is a fake fetch.
const fake = vi.hoisted(() => ({ access: null as GithubAccess | null }))

vi.mock('./hosting', () => ({
  githubAccess: async () => fake.access,
  azureAccess: async () => null,
  remoteLocations: async () => []
}))

import { setFetch } from './http'
import { azureStatusesFromBuilds, getCiStatuses, githubStatus, rerunCi, resetCiCache } from './ciStatus'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

interface Call {
  url: string
  method: string
  body: { query?: string } | undefined
}

let calls: Call[] = []
let respond: (call: Call) => { status?: number; json: unknown } = () => ({ json: {} })
let clock = 0

const failingRun = {
  __typename: 'CheckRun' as const,
  databaseId: 11,
  name: 'test',
  status: 'COMPLETED',
  conclusion: 'FAILURE',
  detailsUrl: 'https://github.com/bryn/app/actions/runs/5/job/11',
  title: null,
  checkSuite: { workflowRun: { databaseId: 5 } }
}

beforeEach(() => {
  calls = []
  clock = 1_000_000
  resetCiCache(() => clock)
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
  respond = () => ({
    json: {
      data: {
        repository: {
          c0: { statusCheckRollup: { contexts: { nodes: [failingRun] } } },
          c1: { statusCheckRollup: null }
        }
      }
    }
  })
  setFetch(async (url, init) => {
    const call: Call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    const { status = 200, json } = respond(call)
    return new Response(JSON.stringify(json), { status, statusText: status === 200 ? 'OK' : 'Error' })
  })
})

describe('githubStatus', () => {
  it('rolls check runs and statuses into one state, failures first, with how to re-run them', () => {
    const status = githubStatus(A, {
      statusCheckRollup: {
        contexts: {
          nodes: [
            { __typename: 'StatusContext' as const, context: 'deploy', state: 'PENDING', targetUrl: null, description: 'Waiting' },
            failingRun,
            { ...failingRun, name: 'app check', checkSuite: { workflowRun: null }, databaseId: 12 },
            {}
          ]
        }
      }
    })
    expect(status?.state).toBe('failure')
    expect(status?.checks.map((c) => [c.name, c.state, c.rerun])).toEqual([
      ['app check', 'failure', { kind: 'github-check-run', id: 12 }],
      ['test', 'failure', { kind: 'github-workflow-run', id: 5 }],
      ['deploy', 'pending', undefined]
    ])
  })

  it('is null for a commit GitHub has no checks for', () => {
    expect(githubStatus(A, null)).toBeNull()
    expect(githubStatus(A, { statusCheckRollup: null })).toBeNull()
  })
})

describe('getCiStatuses', () => {
  it('asks GitHub for every commit in one query and caches the answers', async () => {
    const first = await getCiStatuses('/repo', [A, B, 'not-a-sha'])
    expect(first[A]?.state).toBe('failure')
    expect(first[B]).toBeNull()
    expect(Object.keys(first)).toEqual([A, B])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.github.com/graphql')
    expect(calls[0].body?.query).toContain(`c0: object(oid: "${A}")`)

    await getCiStatuses('/repo', [A, B])
    expect(calls).toHaveLength(1)

    // A commit with no checks is asked about again after a couple of minutes; settled ones later.
    clock += 3 * 60_000
    await getCiStatuses('/repo', [A, B])
    expect(calls).toHaveLength(2)
    expect(calls[1].body?.query).toContain(`c0: object(oid: "${B}")`)
    expect(calls[1].body?.query).not.toContain(A)
  })

  it('gives nothing, and stops asking for a while, when the repo has no CI to ask', async () => {
    fake.access = null
    expect(await getCiStatuses('/repo', [A])).toEqual({})
    expect(await getCiStatuses('/repo', [A])).toEqual({})
    expect(calls).toHaveLength(0)
  })

  it('re-runs failed workflow runs and check runs, then asks about the commit again', async () => {
    await getCiStatuses('/repo', [A])
    await rerunCi('/repo', A, [
      { kind: 'github-workflow-run', id: 5 },
      { kind: 'github-check-run', id: 12 }
    ])
    expect(calls.slice(1).map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.github.com/repos/bryn/app/actions/runs/5/rerun-failed-jobs',
      'POST https://api.github.com/repos/bryn/app/check-runs/12/rerequest'
    ])
    await getCiStatuses('/repo', [A])
    expect(calls).toHaveLength(4)
  })
})

describe('azureStatusesFromBuilds', () => {
  const base = 'https://dev.azure.com/org/proj'
  it("keeps each pipeline's newest build for each commit", () => {
    const statuses = azureStatusesFromBuilds(
      [
        { id: 3, status: 'inProgress', sourceVersion: A, definition: { id: 1, name: 'CI' } },
        { id: 2, status: 'completed', result: 'failed', sourceVersion: A, definition: { id: 1, name: 'CI' } },
        { id: 1, status: 'completed', result: 'failed', sourceVersion: A, definition: { id: 2, name: 'Nightly' } },
        { id: 0, status: 'completed', result: 'succeeded', sourceVersion: 'c'.repeat(40), definition: { id: 1 } }
      ],
      [A, B],
      base
    )
    const a = statuses.get(A)!
    expect(a.state).toBe('failure')
    expect(a.checks.map((c) => [c.name, c.state, c.rerun?.id])).toEqual([
      ['Nightly', 'failure', 1],
      ['CI', 'pending', undefined]
    ])
    expect(a.checks[0].url).toBe(`${base}/_build/results?buildId=1`)
    expect(statuses.get(B)).toBeNull()
  })
})
