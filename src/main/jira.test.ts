import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderAccount } from '../shared/accounts'
import { setFetch } from './http'
import type { Credentials } from './providerApi'

const env = vi.hoisted(() => ({ accounts: [] as { account: ProviderAccount; creds: Credentials }[] }))
vi.mock('./accounts', () => ({ accountsWithCredentials: async () => env.accounts }))

import { assignedJiraIssues, forgetJiraSites, jiraSites, projectKeys, searchIssues } from './jira'
import { verifyAccount } from './providerApi'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

let calls: Call[] = []

function fakeFetch(respond: (call: Call) => { status?: number; json: unknown }): void {
  setFetch(async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    }
    calls.push(call)
    const { status = 200, json } = respond(call)
    return new Response(JSON.stringify(json), { status, statusText: status === 200 ? 'OK' : 'Error' })
  })
}

const cloud: Credentials = { provider: 'jira', host: 'acme.atlassian.net', token: 'tok', username: 'bryn@example.com' }
const dataCenter: Credentials = { provider: 'jira', host: 'jira.example.com', token: 'pat' }

function account(creds: Credentials): { account: ProviderAccount; creds: Credentials } {
  return {
    account: {
      id: creds.host,
      provider: 'jira',
      host: creds.host,
      username: creds.username ?? 'bryn',
      displayName: 'Bryn',
      avatar: null,
      emails: [],
      addedAt: '2026-10-30T00:00:00Z'
    },
    creds
  }
}

const rawIssue = (key: string, updated: string, category = 'indeterminate'): unknown => ({
  key,
  fields: {
    summary: `Summary of ${key}`,
    status: { name: 'In Progress', statusCategory: { key: category } },
    issuetype: { name: 'Bug' },
    priority: null,
    updated
  }
})

beforeEach(() => {
  calls = []
  env.accounts = []
  forgetJiraSites()
})

describe('verifyAccount for Jira', () => {
  it('signs in to Jira Cloud with the email and API token', async () => {
    fakeFetch(() => ({
      json: { accountId: 'abc', displayName: 'Bryn Hill', emailAddress: 'bryn@example.com', avatarUrls: { '48x48': 'https://a/48.png' } }
    }))
    expect(await verifyAccount(cloud)).toEqual({
      username: 'bryn@example.com',
      displayName: 'Bryn Hill',
      avatarUrl: 'https://a/48.png',
      emails: []
    })
    expect(calls[0].url).toBe('https://acme.atlassian.net/rest/api/3/myself')
    expect(calls[0].headers.Authorization).toBe(`Basic ${Buffer.from('bryn@example.com:tok').toString('base64')}`)
  })

  it('uses a bearer token and REST v2 on Data Center', async () => {
    fakeFetch(() => ({ json: { name: 'bryn', displayName: 'Bryn' } }))
    expect((await verifyAccount(dataCenter)).username).toBe('bryn')
    expect(calls[0].url).toBe('https://jira.example.com/rest/api/2/myself')
    expect(calls[0].headers.Authorization).toBe('Bearer pat')
  })

  it('asks for the email on Jira Cloud', async () => {
    fakeFetch(() => ({ json: {} }))
    await expect(verifyAccount({ ...cloud, username: undefined })).rejects.toThrow(/email/)
    expect(calls).toHaveLength(0)
  })
})

describe('searchIssues', () => {
  it('searches with /search/jql on Cloud and /search on Data Center', async () => {
    fakeFetch(() => ({ json: { issues: [rawIssue('PROJ-1', '2026-10-29T10:00:00.000+0000')] } }))
    expect(await searchIssues(cloud)).toEqual([
      {
        key: 'PROJ-1',
        summary: 'Summary of PROJ-1',
        url: 'https://acme.atlassian.net/browse/PROJ-1',
        host: 'acme.atlassian.net',
        status: 'In Progress',
        statusCategory: 'indeterminate',
        type: 'Bug',
        priority: null,
        updatedAt: '2026-10-29T10:00:00.000+0000'
      }
    ])
    expect(calls[0]).toMatchObject({
      url: 'https://acme.atlassian.net/rest/api/3/search/jql',
      method: 'POST',
      body: { jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC', maxResults: 50 }
    })
    await searchIssues(dataCenter)
    expect(calls[1].url).toBe('https://jira.example.com/rest/api/2/search')
  })
})

describe('projectKeys', () => {
  it('pages through Cloud projects', async () => {
    fakeFetch((call) =>
      call.url.includes('startAt=0')
        ? { json: { values: [{ key: 'PROJ' }, { key: 'OPS' }], isLast: false } }
        : { json: { values: [{ key: 'WEB' }], isLast: true } }
    )
    expect(await projectKeys(cloud)).toEqual(['PROJ', 'OPS', 'WEB'])
    expect(calls.map((c) => c.url)).toEqual([
      'https://acme.atlassian.net/rest/api/3/project/search?startAt=0&maxResults=100',
      'https://acme.atlassian.net/rest/api/3/project/search?startAt=2&maxResults=100'
    ])
  })

  it('reads the Data Center project list in one go', async () => {
    fakeFetch(() => ({ json: [{ key: 'WEB' }] }))
    expect(await projectKeys(dataCenter)).toEqual(['WEB'])
    expect(calls[0].url).toBe('https://jira.example.com/rest/api/2/project')
  })
})

describe('assignedJiraIssues', () => {
  it('is not connected without a Jira account', async () => {
    expect(await assignedJiraIssues()).toEqual({ connected: false, issues: [], problems: [] })
  })

  it('merges every site, newest first, and reports a site that refused', async () => {
    env.accounts = [account(cloud), account(dataCenter), account({ ...dataCenter, host: 'old.example.com' })]
    fakeFetch((call) => {
      if (call.url.startsWith('https://acme')) return { json: { issues: [rawIssue('PROJ-1', '2026-10-28T10:00:00Z')] } }
      if (call.url.startsWith('https://jira')) return { json: { issues: [rawIssue('WEB-2', '2026-10-29T10:00:00Z', 'new')] } }
      return { status: 401, json: { errorMessages: ['nope'] } }
    })
    const result = await assignedJiraIssues()
    expect(result.connected).toBe(true)
    expect(result.issues.map((i) => i.key)).toEqual(['WEB-2', 'PROJ-1'])
    expect(result.issues[0].statusCategory).toBe('new')
    expect(result.problems).toEqual([
      { host: 'old.example.com', message: 'old.example.com rejected the token for bryn. Add it again in Settings.' }
    ])
  })
})

describe('jiraSites', () => {
  it('caches project keys and keeps the last ones when a site is down', async () => {
    env.accounts = [account(dataCenter)]
    let up = true
    fakeFetch(() => (up ? { json: [{ key: 'WEB' }] } : { status: 500, json: {} }))
    expect(await jiraSites()).toEqual([{ host: 'jira.example.com', projectKeys: ['WEB'] }])
    expect(await jiraSites()).toEqual([{ host: 'jira.example.com', projectKeys: ['WEB'] }])
    expect(calls).toHaveLength(1)

    forgetJiraSites()
    up = false
    expect(await jiraSites()).toEqual([{ host: 'jira.example.com', projectKeys: [] }])
  })
})
