import { mkdtempSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setFetch } from './http'
import { apiBase, gitUsername, gitlabAvatarUrl, verifyAccount } from './providerApi'
import { commitAuthorAvatars, launchpadPullRequests, toGhStyle } from './github'
import { AvatarResolver, botFor, githubNoreplyAvatarUrl, gravatarUrl } from './avatars'
import { normalizeHost, parseRemoteUrl } from '../shared/accounts'
import type { ProviderAccount } from '../shared/accounts'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

const calls: Call[] = []
type Route = (call: Call) => Response | Promise<Response> | undefined

function fakeFetch(...routes: Route[]): void {
  setFetch(async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})),
      body: init?.body as string | undefined
    }
    calls.push(call)
    for (const route of routes) {
      const res = await route(call)
      if (res) return res
    }
    return new Response('not found', { status: 404 })
  })
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const png = (): Response => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })

beforeEach(() => {
  calls.length = 0
})

describe('hosts and remotes', () => {
  it('cleans up a typed host', () => {
    expect(normalizeHost(' https://GitHub.Example.com/org ')).toBe('github.example.com')
    expect(normalizeHost('git@gitlab.com')).toBe('gitlab.com')
  })

  it('parses ssh and https remotes', () => {
    expect(parseRemoteUrl('git@github.com:bryn-hill/sillygit.git')).toEqual({ host: 'github.com', path: 'bryn-hill/sillygit' })
    expect(parseRemoteUrl('https://user@GitLab.com/group/sub/repo.git')).toEqual({ host: 'gitlab.com', path: 'group/sub/repo' })
  })

  it('knows each service’s API root', () => {
    expect(apiBase('github', 'github.com')).toBe('https://api.github.com')
    expect(apiBase('github', 'ghe.corp')).toBe('https://ghe.corp/api/v3')
    expect(apiBase('gitlab', 'gitlab.com')).toBe('https://gitlab.com/api/v4')
    expect(apiBase('gitea', 'codeberg.org')).toBe('https://codeberg.org/api/v1')
  })

  it('uses Bitbucket’s token username when the account was added by email', () => {
    expect(gitUsername('bitbucket', 'ada', 'ada@example.com')).toBe('x-bitbucket-api-token-auth')
    expect(gitUsername('github', 'octocat')).toBe('octocat')
  })
})

describe('verifyAccount', () => {
  it('reads a GitHub user and their verified emails', async () => {
    fakeFetch(
      (c) => (c.url === 'https://api.github.com/user' ? json({ login: 'octocat', name: 'The Octocat', avatar_url: 'https://a/1' }) : undefined),
      (c) =>
        c.url === 'https://api.github.com/user/emails'
          ? json([
              { email: 'Octo@Example.com', verified: true },
              { email: 'unverified@example.com', verified: false }
            ])
          : undefined
    )
    const account = await verifyAccount({ provider: 'github', host: 'github.com', token: 'ghp_x' })
    expect(account).toEqual({ username: 'octocat', displayName: 'The Octocat', avatarUrl: 'https://a/1', emails: ['octo@example.com'] })
    expect(calls[0].headers['Authorization']).toBe('Bearer ghp_x')
  })

  it('still works when the token may not read emails', async () => {
    fakeFetch(
      (c) => (c.url.endsWith('/user') ? json({ login: 'octocat', name: null }) : undefined),
      (c) => (c.url.endsWith('/user/emails') ? json({ message: 'Resource not accessible' }, 403) : undefined)
    )
    const account = await verifyAccount({ provider: 'github', host: 'github.com', token: 'x' })
    expect(account.displayName).toBe('octocat')
    expect(account.emails).toEqual([])
  })

  it('reports the service’s message for a bad token', async () => {
    fakeFetch(() => json({ message: 'Bad credentials' }, 401))
    await expect(verifyAccount({ provider: 'github', host: 'github.com', token: 'nope' })).rejects.toThrow(
      /401.*Bad credentials/
    )
  })

  it('sends GitLab tokens as PRIVATE-TOKEN to the self-hosted server', async () => {
    fakeFetch((c) =>
      c.url === 'https://git.corp/api/v4/user'
        ? json({ username: 'ada', name: 'Ada', commit_email: 'ada@corp.com', email: 'ada@corp.com' })
        : undefined
    )
    const account = await verifyAccount({ provider: 'gitlab', host: 'git.corp', token: 'glpat' })
    expect(calls[0].headers['PRIVATE-TOKEN']).toBe('glpat')
    expect(account.emails).toEqual(['ada@corp.com'])
  })

  it('signs in to Bitbucket with the account email and API token', async () => {
    fakeFetch(
      (c) => (c.url.endsWith('/2.0/user') ? json({ username: 'ada', display_name: 'Ada L' }) : undefined),
      (c) => (c.url.endsWith('/2.0/user/emails') ? json({ values: [] }) : undefined)
    )
    const account = await verifyAccount({ provider: 'bitbucket', host: 'bitbucket.org', token: 'tok', username: 'ada@example.com' })
    expect(calls[0].headers['Authorization']).toBe(`Basic ${Buffer.from('ada@example.com:tok').toString('base64')}`)
    expect(account).toMatchObject({ username: 'ada', displayName: 'Ada L', emails: ['ada@example.com'] })
  })
})

describe('GitHub API', () => {
  const creds = { provider: 'github' as const, host: 'github.com', token: 't' }
  const repo = { host: 'github.com', owner: 'bryn-hill', name: 'sillygit' }

  const graphqlPr = {
    number: 7,
    title: 'Add tokens',
    url: 'https://github.com/bryn-hill/sillygit/pull/7',
    author: { login: 'bryn-hill' },
    isDraft: false,
    headRefName: 'feat',
    baseRefName: 'main',
    mergeable: 'MERGEABLE',
    reviewDecision: null,
    reviewRequests: { totalCount: 2 },
    reviews: { nodes: [{ author: { login: 'ada' }, state: 'COMMENTED' }] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'EXPECTED' } } }] },
    updatedAt: '2026-10-27T10:00:00Z',
    additions: 10,
    deletions: 2
  }

  it('maps a GraphQL pull request to the gh CLI shape', () => {
    expect(toGhStyle(graphqlPr)).toMatchObject({
      number: 7,
      reviewDecision: '',
      reviewRequests: [null, null],
      reviews: [{ author: { login: 'ada' }, state: 'COMMENTED' }],
      statusCheckRollup: [{ state: 'PENDING' }]
    })
  })

  it('asks for the repo’s authored and review-requested pull requests in one query', async () => {
    fakeFetch((c) =>
      c.url === 'https://api.github.com/graphql'
        ? json({ data: { authored: { nodes: [graphqlPr, {}] }, requested: { nodes: [] } } })
        : undefined
    )
    const result = await launchpadPullRequests(creds, repo)
    expect(result.authored.map((p) => p.number)).toEqual([7])
    const vars = JSON.parse(calls[0].body!).variables
    expect(vars.authored).toBe('repo:bryn-hill/sillygit is:pr is:open author:@me')
    expect(vars.requested).toBe('repo:bryn-hill/sillygit is:pr is:open review-requested:@me')
  })

  it('finds avatars of the users behind commits', async () => {
    fakeFetch((c) =>
      c.url.endsWith('/graphql')
        ? json({ data: { repository: { c0: { author: { user: { avatarUrl: 'https://avatars/ada' } } }, c1: { author: { user: null } } } } })
        : undefined
    )
    const found = await commitAuthorAvatars(creds, repo, [
      { email: 'ada@example.com', hash: 'abc123' },
      { email: 'nobody@example.com', hash: 'def456' }
    ])
    expect([...found]).toEqual([['ada@example.com', 'https://avatars/ada']])
    expect(JSON.parse(calls[0].body!).query).toContain('c0: object(oid: "abc123")')
  })
})

describe('gitlabAvatarUrl', () => {
  it('keeps avatars GitLab hosts and skips its Gravatar fallback', async () => {
    fakeFetch((c) =>
      c.url.includes('email=ada')
        ? json({ avatar_url: 'https://gitlab.com/uploads/ada.png' })
        : json({ avatar_url: 'https://secure.gravatar.com/avatar/x?d=identicon' })
    )
    expect(await gitlabAvatarUrl('gitlab.com', 'ada@example.com')).toBe('https://gitlab.com/uploads/ada.png')
    expect(await gitlabAvatarUrl('gitlab.com', 'bob@example.com')).toBeNull()
  })
})

describe('avatars', () => {
  let dir: string
  let clock = 0
  const account: ProviderAccount = {
    id: '1',
    provider: 'github',
    host: 'github.com',
    username: 'me',
    displayName: 'Me',
    avatar: 'data:image/png;base64,ME',
    emails: ['me@example.com'],
    addedAt: ''
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sillygit-avatars-'))
    clock = 1_000_000
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads GitHub noreply addresses without a lookup', () => {
    expect(githubNoreplyAvatarUrl('583231+octocat@users.noreply.github.com')).toBe(
      'https://avatars.githubusercontent.com/u/583231?s=64&v=4'
    )
    expect(githubNoreplyAvatarUrl('octocat@users.noreply.github.com')).toBe('https://github.com/octocat.png?size=64')
    expect(githubNoreplyAvatarUrl('octocat@example.com')).toBeNull()
  })

  it('recognises Claude and Renovate commits', () => {
    expect(botFor('noreply@anthropic.com')).toBe('claude')
    expect(botFor('209825114+claude[bot]@users.noreply.github.com')).toBe('claude')
    expect(botFor('29139614+renovate[bot]@users.noreply.github.com')).toBe('renovate')
    expect(botFor('bot@renovateapp.com')).toBe('renovate')
    expect(botFor('claude@example.com')).toBeNull()
    expect(botFor('583231+octocat@users.noreply.github.com')).toBeNull()
  })

  it('gives bots their bundled logo without asking anyone', async () => {
    fakeFetch(() => png())
    const resolver = new AvatarResolver(dir, () => clock)
    const result = await resolver.resolve(
      [
        { email: 'noreply@anthropic.com', hash: 'c0' },
        { email: '29139614+renovate[bot]@users.noreply.github.com', hash: 'c1' }
      ],
      { accounts: [], bots: { claude: 'data:claude', renovate: 'data:renovate' }, gravatar: true }
    )
    expect(result).toEqual({
      'noreply@anthropic.com': 'data:claude',
      '29139614+renovate[bot]@users.noreply.github.com': 'data:renovate'
    })
    expect(calls).toEqual([])
  })

  it('tries the account, noreply, GitHub and Gravatar in turn', async () => {
    fakeFetch(
      (c) => (c.url.startsWith('https://avatars.githubusercontent.com/u/1') || c.url === 'https://avatars/ada' ? png() : undefined),
      (c) => (c.url === gravatarUrl('grav@example.com') ? png() : undefined)
    )
    const resolver = new AvatarResolver(dir, () => clock)
    const githubLookup = async (): Promise<Map<string, string>> => new Map([['ada@example.com', 'https://avatars/ada']])
    const result = await resolver.resolve(
      [
        { email: 'Me@example.com', hash: 'a' },
        { email: '1+bot@users.noreply.github.com', hash: 'b' },
        { email: 'ada@example.com', hash: 'c' },
        { email: 'grav@example.com', hash: 'd' },
        { email: 'nobody@example.com', hash: 'e' }
      ],
      { accounts: [account], githubLookup, gravatar: true }
    )
    expect(result).toEqual({
      'me@example.com': 'data:image/png;base64,ME',
      '1+bot@users.noreply.github.com': 'data:image/png;base64,iVBORw==',
      'ada@example.com': 'data:image/png;base64,iVBORw==',
      'grav@example.com': 'data:image/png;base64,iVBORw==',
      'nobody@example.com': null
    })
  })

  it('caches hits and misses on disk, and retries misses after a day', async () => {
    fakeFetch((c) => (c.url === gravatarUrl('grav@example.com') ? png() : undefined))
    const sources = { accounts: [], gravatar: true }
    const requests = [
      { email: 'grav@example.com', hash: 'a' },
      { email: 'nobody@example.com', hash: 'b' }
    ]
    const first = new AvatarResolver(dir, () => clock)
    await first.resolve(requests, sources)
    await first.flush()
    const firstCalls = calls.length

    // A fresh resolver (a relaunch) answers from disk.
    const again = await new AvatarResolver(dir, () => clock).resolve(requests, sources)
    expect(again['grav@example.com']).toMatch(/^data:image\/png/)
    expect(again['nobody@example.com']).toBeNull()
    expect(calls.length).toBe(firstCalls)
    expect(readdirSync(dir)).toContain('index.json')

    // Misses are tried again after a day; hits are kept for a week.
    clock += 25 * 60 * 60 * 1000
    await new AvatarResolver(dir, () => clock).resolve(requests, sources)
    expect(calls.slice(firstCalls).map((c) => c.url)).toEqual([gravatarUrl('nobody@example.com')])
  })

  it("doesn't remember a miss when the network failed", async () => {
    setFetch(async () => {
      throw new Error('offline')
    })
    const resolver = new AvatarResolver(dir, () => clock)
    const sources = { accounts: [], gravatar: true }
    expect(await resolver.resolve([{ email: 'x@example.com', hash: 'a' }], sources)).toEqual({ 'x@example.com': null })
    fakeFetch(() => png())
    expect((await resolver.resolve([{ email: 'x@example.com', hash: 'a' }], sources))['x@example.com']).toMatch(/^data:/)
  })
})
