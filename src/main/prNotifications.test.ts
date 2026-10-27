import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setFetch } from './http'
import {
  PrNotifier,
  collectEvents,
  fetchPrActivity,
  isAgentBranch,
  pickNotifications,
  toNotifications,
  type PrActivity,
  type ShownNotification
} from './prNotifications'
import { DEFAULT_NOTIFICATION_SETTINGS, normalizeNotificationSettings } from '../shared/notifications'
import type { Credentials } from './providerApi'
import type { ProviderAccount } from '../shared/accounts'

const creds: Credentials = { provider: 'github', host: 'github.com', token: 't0ken' }
const account: ProviderAccount = {
  id: 'a1',
  provider: 'github',
  host: 'github.com',
  username: 'bryn',
  displayName: 'Bryn',
  avatar: null,
  emails: [],
  addedAt: '2026-10-01T00:00:00Z'
}

const repo = { nameWithOwner: 'bryn/app' }

function pr(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, number: Number(id.replace(/\D/g, '')) || 1, title: `PR ${id}`, url: `https://github.com/bryn/app/pull/${id}`, createdAt: '2026-10-27T10:00:00Z', author: { login: 'alice' }, repository: repo, ...over }
}

function myPr(id: string, reviews: unknown[] = [], comments: unknown[] = []): Record<string, unknown> {
  return pr(id, { author: { login: 'bryn' }, reviews: { nodes: reviews }, comments: { nodes: comments } })
}

const review = (id: string, state: string, login: string, at: string, body = ''): unknown => ({
  id,
  state,
  body,
  url: `https://github.com/r/${id}`,
  submittedAt: at,
  author: { login },
  comments: { nodes: [] }
})

const comment = (id: string, login: string, at: string, body: string): unknown => ({
  id,
  body,
  url: `https://github.com/c/${id}`,
  createdAt: at,
  author: { login }
})

/** Answers GitHub's GraphQL with whatever `respond` returns for the query's searches. */
function fakeGithub(respond: (queries: Record<string, string>) => Record<string, unknown[]>): { bodies: { query: string; variables: Record<string, string> }[] } {
  const bodies: { query: string; variables: Record<string, string> }[] = []
  setFetch(async (url, init) => {
    if (url !== 'https://api.github.com/graphql') return new Response('nope', { status: 404 })
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer t0ken')
    const body = JSON.parse(init?.body as string) as { query: string; variables: Record<string, string> }
    bodies.push(body)
    const aliases = [...body.query.matchAll(/(\w+): search\(query: \$(q\d+)/g)]
    const queries = Object.fromEntries(aliases.map(([, alias, v]) => [alias, body.variables[v]]))
    const nodes = respond(queries)
    const data = Object.fromEntries(aliases.map(([, alias]) => [alias, { nodes: nodes[alias] ?? [] }]))
    return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } })
  })
  return { bodies }
}

describe('fetchPrActivity', () => {
  it('searches my PRs, review requests, my repos and watched repos in one query', async () => {
    const { bodies } = fakeGithub(() => ({
      mine: [myPr('m1')],
      requested: [pr('r1')],
      owned: [pr('o1'), {}],
      watched0: [pr('o1'), pr('w1')],
      watched1: [pr('w2')]
    }))
    const watched = ['bryn/app', 'org/a', 'org/b', 'org/c', 'org/d', 'org/e', 'org/f', 'org/a']
    const activity = await fetchPrActivity(creds, 'bryn', watched)

    expect(bodies).toHaveLength(1)
    const queries = Object.values(bodies[0].variables)
    expect(queries).toContain('is:pr is:open archived:false author:bryn')
    expect(queries).toContain('is:pr is:open archived:false review-requested:bryn')
    expect(queries).toContain('is:pr is:open archived:false user:bryn')
    // Own repos are already covered by user:, and the rest go five to a search.
    expect(queries).toContain('is:pr is:open repo:org/a repo:org/b repo:org/c repo:org/d repo:org/e')
    expect(queries).toContain('is:pr is:open repo:org/f')

    expect(activity.mine.map((p) => p.id)).toEqual(['m1'])
    expect(activity.reviewRequested.map((p) => p.id)).toEqual(['r1'])
    expect(activity.inWatchedRepos.map((p) => p.id)).toEqual(['o1', 'w1', 'w2'])
  })
})

const activity = (over: Partial<Record<keyof PrActivity, unknown[]>>): PrActivity =>
  ({ mine: [], reviewRequested: [], inWatchedRepos: [], ...over }) as unknown as PrActivity

describe('collectEvents', () => {
  it('turns reviews and comments on my PRs into events, skipping my own', () => {
    const events = collectEvents(
      'Bryn',
      activity({
        mine: [
          myPr('m1', [
            review('v1', 'APPROVED', 'alice', '2026-10-27T11:00:00Z'),
            review('v2', 'CHANGES_REQUESTED', 'bob', '2026-10-27T11:01:00Z', 'Please   fix\n the tests'),
            review('v3', 'COMMENTED', 'bryn', '2026-10-27T11:02:00Z', 'my own reply'),
            review('v4', 'DISMISSED', 'carol', '2026-10-27T11:03:00Z'),
            review('v5', 'PENDING', 'dave', null as unknown as string)
          ], [comment('c1', 'alice', '2026-10-27T11:04:00Z', '<!-- bot -->Looks good'), comment('c2', 'bryn', '2026-10-27T11:05:00Z', 'thanks')])
        ]
      })
    )
    expect(events.map((e) => [e.id, e.kind])).toEqual([
      ['rv:v1', 'approved'],
      ['rv:v2', 'changesRequested'],
      ['c:c1', 'comment']
    ])
    expect(events[0].title).toBe('alice approved your pull request')
    expect(events[1].body).toBe('bryn/app #1: PR m1\nPlease fix the tests')
    expect(events[2]).toMatchObject({ title: 'alice commented on #1', url: 'https://github.com/c/c1' })
    expect(events[2].body.endsWith('Looks good')).toBe(true)
  })
})

describe('pickNotifications', () => {
  const login = 'bryn'
  const now = new Date('2026-10-27T12:00:00Z')
  const settings = DEFAULT_NOTIFICATION_SETTINGS
  const lastCheck = { lastCheckedAt: '2026-10-27T11:58:00Z', seen: [] as string[] }
  const events = collectEvents(
    login,
    activity({
      inWatchedRepos: [pr('n1', { createdAt: '2026-10-27T11:59:00Z' }), pr('old1', { createdAt: '2026-09-01T00:00:00Z' }), pr('n2', { createdAt: '2026-10-27T11:59:00Z', author: { login: 'bryn' } }), pr('r1', { createdAt: '2026-10-27T11:59:00Z' }), pr('a9', { createdAt: '2026-10-27T11:59:00Z', author: { login: 'bryn' }, headRefName: 'claude/project-thread-x' })],
      reviewRequested: [pr('r1')],
      mine: [myPr('m1', [review('v1', 'APPROVED', 'alice', '2026-10-27T11:59:30Z')])]
    })
  )

  it('only takes note of what is there on the first check', () => {
    const picked = pickNotifications(events, undefined, settings, login, now)
    expect(picked.notify).toEqual([])
    expect(picked.state.lastCheckedAt).toBe(now.toISOString())
    expect(picked.state.seen).toContain('rv:v1')
  })

  it('announces new things once, skipping old PRs in newly watched repos and PRs I opened by hand', () => {
    const picked = pickNotifications(events, lastCheck, settings, login, now)
    // a9 is mine too, but on an agent's branch, so it counts as coming in.
    expect(picked.notify.map((e) => e.id).sort()).toEqual(['pr:a9', 'pr:n1', 'rr:r1', 'rv:v1'])
    const again = pickNotifications(events, picked.state, settings, login, new Date('2026-10-27T12:02:00Z'))
    expect(again.notify).toEqual([])
  })

  it('respects the per-kind switches and the own-PR option', () => {
    const quiet = normalizeNotificationSettings({ kinds: { approved: false, reviewRequested: false }, includeMyOwnPullRequests: true })
    const picked = pickNotifications(events, lastCheck, quiet, login, now)
    // r1 falls back to its new-PR notification when review requests are off.
    expect(picked.notify.map((e) => e.id).sort()).toEqual(['pr:a9', 'pr:n1', 'pr:n2', 'pr:r1'])
    // Switched-off kinds still count as seen, so turning them on later doesn't replay them.
    expect(picked.state.seen).toContain('rv:v1')
  })

  it('announces a review request again after it was withdrawn and re-requested', () => {
    const requested = collectEvents(login, activity({ reviewRequested: [pr('r1')] }))
    const first = pickNotifications(requested, lastCheck, settings, login, now)
    expect(first.notify).toHaveLength(1)
    const gone = pickNotifications([], first.state, settings, login, now)
    expect(pickNotifications(requested, gone.state, settings, login, now).notify).toHaveLength(1)
  })

  it('starts over quietly after a long gap', () => {
    const stale = { lastCheckedAt: '2026-10-01T00:00:00Z', seen: [] }
    expect(pickNotifications(events, stale, settings, login, now).notify).toEqual([])
  })
})

describe('isAgentBranch', () => {
  it('recognises coding agents’ branches', () => {
    expect(isAgentBranch('claude/project-thread-k81sdb')).toBe(true)
    expect(isAgentBranch('codex/fix-login')).toBe(true)
    expect(isAgentBranch('copilot/fix-123')).toBe(true)
    expect(isAgentBranch('feature/claude-panel')).toBe(false)
    expect(isAgentBranch('main')).toBe(false)
  })
})

describe('toNotifications', () => {
  it('folds a burst into a summary', () => {
    const many = collectEvents(
      'bryn',
      activity({ reviewRequested: [pr('a1'), pr('a2'), pr('a3'), pr('a4'), pr('a5')] })
    )
    expect(toNotifications(many.slice(0, 3), 'github.com')).toHaveLength(3)
    const shown = toNotifications(many, 'github.com')
    expect(shown).toHaveLength(3)
    expect(shown[0]).toEqual({
      title: '3 more pull request updates',
      body: 'Click to see your pull requests on GitHub.',
      url: 'https://github.com/pulls'
    })
  })
})

describe('PrNotifier', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sillygit-notify-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('remembers what it announced across restarts', async () => {
    let requested = [pr('r1')]
    fakeGithub(() => ({ requested }))
    let now = new Date('2026-10-27T12:00:00Z')
    const shown: ShownNotification[] = []
    const make = (): PrNotifier =>
      new PrNotifier({
        settings: async () => DEFAULT_NOTIFICATION_SETTINGS,
        accounts: async () => [{ account, creds }],
        watchedRepos: async () => [],
        show: (n) => shown.push(n),
        statePath: join(dir, 'state.json'),
        now: () => now
      })

    await make().checkNow()
    expect(shown).toEqual([])

    requested = [pr('r1'), pr('r2')]
    now = new Date('2026-10-27T12:02:00Z')
    await make().checkNow()
    expect(shown).toEqual([{ title: 'alice asked for your review', body: 'bryn/app #2: PR r2', url: 'https://github.com/bryn/app/pull/r2' }])

    now = new Date('2026-10-27T12:04:00Z')
    await make().checkNow()
    expect(shown).toHaveLength(1)
  })

  it('keeps going when GitHub fails, and stays quiet while turned off', async () => {
    setFetch(async () => new Response('{"message":"Bad credentials"}', { status: 401 }))
    const shown: ShownNotification[] = []
    const notifier = new PrNotifier({
      settings: async () => ({ ...DEFAULT_NOTIFICATION_SETTINGS, enabled: false }),
      accounts: async () => [{ account, creds }],
      watchedRepos: async () => [],
      show: (n) => shown.push(n),
      statePath: join(dir, 'state.json')
    })
    await notifier.restart()
    await notifier.checkNow()
    expect(shown).toEqual([])

    const failing = new PrNotifier({
      settings: async () => DEFAULT_NOTIFICATION_SETTINGS,
      accounts: async () => [{ account, creds }],
      watchedRepos: async () => [],
      show: (n) => shown.push(n),
      statePath: join(dir, 'state.json')
    })
    await expect(failing.checkNow()).resolves.toBeUndefined()
    expect(shown).toEqual([])
  })
})
