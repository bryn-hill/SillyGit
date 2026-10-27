import { promises as fs } from 'fs'
import { dirname } from 'path'
import { graphql } from './github'
import type { Credentials } from './providerApi'
import type { ProviderAccount } from '../shared/accounts'
import type { NotificationSettings, PrNotificationKind } from '../shared/notifications'

/**
 * Desktop notifications about pull requests on GitHub: new ones in the
 * user's repositories, review requests, and reviews and comments on the
 * user's own pull requests. Each signed-in GitHub account is checked on a
 * timer with a few GraphQL searches; what was already seen is kept on disk
 * so nothing is announced twice, even across restarts.
 */

interface Actor {
  login: string
}

interface PrBase {
  id: string
  headRefName: string
  number: number
  title: string
  url: string
  createdAt: string
  author: Actor | null
  repository: { nameWithOwner: string }
}

interface MyPr extends PrBase {
  reviews: {
    nodes: {
      id: string
      state: string
      body: string
      url: string
      submittedAt: string | null
      author: Actor | null
      comments: { nodes: { body: string }[] }
    }[]
  }
  comments: { nodes: { id: string; body: string; url: string; createdAt: string; author: Actor | null }[] }
}

export interface PrActivity {
  /** Open pull requests the user opened. */
  mine: MyPr[]
  /** Open pull requests waiting for the user's review. */
  reviewRequested: PrBase[]
  /** Open pull requests in repositories the user owns or works on in SillyGit. */
  inWatchedRepos: PrBase[]
}

const PR_BASE = 'id headRefName number title url createdAt author { login } repository { nameWithOwner }'

const MY_PR_FIELDS = `${PR_BASE}
  reviews(last: 20) { nodes { id state body url submittedAt author { login } comments(first: 1) { nodes { body } } } }
  comments(last: 20) { nodes { id body url createdAt author { login } } }`

// GitHub's search caps a query at five boolean operators, and several repo:
// qualifiers are OR-ed together, so a handful of repositories go in each search.
const REPOS_PER_SEARCH = 5

/** Searches GitHub for everything the notifications are built from. */
export async function fetchPrActivity(creds: Credentials, login: string, watchedRepos: string[]): Promise<PrActivity> {
  const searches: { alias: string; query: string; fields: string }[] = [
    { alias: 'mine', query: `is:pr is:open archived:false author:${login}`, fields: MY_PR_FIELDS },
    { alias: 'requested', query: `is:pr is:open archived:false review-requested:${login}`, fields: PR_BASE },
    { alias: 'owned', query: `is:pr is:open archived:false user:${login}`, fields: PR_BASE }
  ]
  const others = [...new Set(watchedRepos)].filter((slug) => slug.split('/')[0].toLowerCase() !== login.toLowerCase())
  for (let i = 0; i < others.length; i += REPOS_PER_SEARCH) {
    const repos = others.slice(i, i + REPOS_PER_SEARCH).map((slug) => `repo:${slug}`)
    searches.push({ alias: `watched${i / REPOS_PER_SEARCH}`, query: `is:pr is:open ${repos.join(' ')}`, fields: PR_BASE })
  }

  const variables: Record<string, string> = {}
  const parts = searches.map((s, i) => {
    variables[`q${i}`] = s.query
    return `${s.alias}: search(query: $q${i}, type: ISSUE, first: 50) { nodes { ... on PullRequest { ${s.fields} } } }`
  })
  const query = `query(${searches.map((_, i) => `$q${i}: String!`).join(', ')}) {\n${parts.join('\n')}\n}`
  const data = await graphql<Record<string, { nodes: (PrBase | Record<string, never>)[] } | null>>(creds, query, variables)

  const prs = <T extends PrBase>(alias: string): T[] =>
    (data?.[alias]?.nodes ?? []).filter((n): n is T => 'id' in n && typeof n.id === 'string')
  const watched = new Map<string, PrBase>()
  for (const s of searches) {
    if (s.alias === 'owned' || s.alias.startsWith('watched')) for (const pr of prs(s.alias)) watched.set(pr.id, pr)
  }
  return { mine: prs<MyPr>('mine'), reviewRequested: prs('requested'), inWatchedRepos: [...watched.values()] }
}

/** Something that may be worth a notification. */
export interface PrEvent {
  /** Stable across checks, so it's announced once. */
  id: string
  kind: PrNotificationKind
  /** The pull request it's about; one notification per pull request and check is enough. */
  prId: string
  prAuthor: string
  /** The pull request's branch is a coding agent's (claude/..., codex/...). */
  fromAgent: boolean
  /** When it happened, if GitHub says. Older events than the last check are never announced. */
  at: string | null
  title: string
  body: string
  url: string
}

// Branch prefixes coding agents push to. A pull request on one of these was
// opened by an agent, even when it carries the user's own name.
const AGENT_BRANCH = /^(claude|codex|copilot|cursor|devin|jules|sweep)[/-]/i

/** Whether a pull request's branch looks like a coding agent's. */
export function isAgentBranch(headRefName: string): boolean {
  return AGENT_BRANCH.test(headRefName)
}

const SNIPPET_LENGTH = 140

function snippet(text: string): string {
  const flat = text.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()
  return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…` : flat
}

function prLabel(pr: PrBase): string {
  return `${pr.repository.nameWithOwner} #${pr.number}: ${pr.title}`
}

/** Turns what GitHub returned into events, leaving out the user's own reviews and comments. */
export function collectEvents(login: string, activity: PrActivity): PrEvent[] {
  const me = login.toLowerCase()
  const isMe = (actor: Actor | null): boolean => actor?.login.toLowerCase() === me
  const who = (actor: Actor | null): string => actor?.login ?? 'Someone'
  const events: PrEvent[] = []

  for (const pr of activity.inWatchedRepos) {
    events.push({
      id: `pr:${pr.id}`,
      kind: 'newPullRequest',
      prId: pr.id,
      prAuthor: who(pr.author),
      fromAgent: isAgentBranch(pr.headRefName ?? ''),
      at: pr.createdAt,
      title: `New pull request in ${pr.repository.nameWithOwner}`,
      body: `#${pr.number} ${pr.title} (by ${who(pr.author)})`,
      url: pr.url
    })
  }

  for (const pr of activity.reviewRequested) {
    events.push({
      // No timestamp: a request that goes away and comes back is announced again.
      id: `rr:${pr.id}`,
      kind: 'reviewRequested',
      prId: pr.id,
      prAuthor: who(pr.author),
      fromAgent: isAgentBranch(pr.headRefName ?? ''),
      at: null,
      title: `${who(pr.author)} asked for your review`,
      body: prLabel(pr),
      url: pr.url
    })
  }

  for (const pr of activity.mine) {
    for (const review of pr.reviews.nodes) {
      if (isMe(review.author) || !review.submittedAt) continue
      const kind: PrNotificationKind | null =
        review.state === 'APPROVED'
          ? 'approved'
          : review.state === 'CHANGES_REQUESTED'
            ? 'changesRequested'
            : review.state === 'COMMENTED'
              ? 'comment'
              : null
      if (!kind) continue
      const text = snippet(review.body || review.comments.nodes[0]?.body || '')
      const title =
        kind === 'approved'
          ? `${who(review.author)} approved your pull request`
          : kind === 'changesRequested'
            ? `${who(review.author)} requested changes`
            : `${who(review.author)} commented on #${pr.number}`
      events.push({
        id: `rv:${review.id}`,
        kind,
        prId: pr.id,
        prAuthor: login,
        fromAgent: isAgentBranch(pr.headRefName ?? ''),
        at: review.submittedAt,
        title,
        body: text ? `${prLabel(pr)}\n${text}` : prLabel(pr),
        url: review.url || pr.url
      })
    }
    for (const comment of pr.comments.nodes) {
      if (isMe(comment.author)) continue
      const text = snippet(comment.body)
      events.push({
        id: `c:${comment.id}`,
        kind: 'comment',
        prId: pr.id,
        prAuthor: login,
        fromAgent: isAgentBranch(pr.headRefName ?? ''),
        at: comment.createdAt,
        title: `${who(comment.author)} commented on #${pr.number}`,
        body: text ? `${prLabel(pr)}\n${text}` : prLabel(pr),
        url: comment.url || pr.url
      })
    }
  }
  return events
}

/** What's remembered per account between checks. */
export interface SeenState {
  /** When the account was last checked; null until the first check, which only takes note of what's there. */
  lastCheckedAt: string | null
  /** Ids of every event in the last check. */
  seen: string[]
}

// Allows for clock differences between this computer and GitHub.
const CLOCK_SLACK_MS = 10 * 60 * 1000
// After this long without a check (notifications off, app closed for days),
// start over quietly instead of announcing everything that happened since.
const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000

/** Picks the events to announce and the state to remember for next time. */
export function pickNotifications(
  events: PrEvent[],
  state: SeenState | undefined,
  settings: NotificationSettings,
  login: string,
  now: Date
): { notify: PrEvent[]; state: SeenState } {
  const next: SeenState = { lastCheckedAt: now.toISOString(), seen: [...new Set(events.map((e) => e.id))] }
  const last = state?.lastCheckedAt ? Date.parse(state.lastCheckedAt) : NaN
  if (!state || Number.isNaN(last) || now.getTime() - last > STALE_AFTER_MS) return { notify: [], state: next }

  const seen = new Set(state.seen)
  const since = last - CLOCK_SLACK_MS
  const me = login.toLowerCase()
  const fresh = events.filter(
    (e) =>
      !seen.has(e.id) &&
      settings.kinds[e.kind] &&
      (e.at === null || Date.parse(e.at) >= since) &&
      (e.kind !== 'newPullRequest' ||
        e.prAuthor.toLowerCase() !== me ||
        e.fromAgent ||
        settings.includeMyOwnPullRequests)
  )
  // A new pull request that also asks for the user's review is announced once, as the review request.
  const requested = new Set(fresh.filter((e) => e.kind === 'reviewRequested').map((e) => e.prId))
  const notify = fresh.filter((e, i) => {
    if (e.kind === 'newPullRequest' && requested.has(e.prId)) return false
    return fresh.findIndex((o) => o.id === e.id) === i
  })
  notify.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
  return { notify, state: next }
}

/** A notification to put on screen; clicking it opens `url` when there is one. */
export interface ShownNotification {
  title: string
  body: string
  url: string | null
}

// More than this at once (say, after the laptop wakes up) become a summary.
const MAX_SEPARATE = 3

/** The notifications to show for a check's events, folding a burst into one summary. */
export function toNotifications(events: PrEvent[], host: string): ShownNotification[] {
  if (events.length <= MAX_SEPARATE) return events.map((e) => ({ title: e.title, body: e.body, url: e.url }))
  const shown = events.slice(-(MAX_SEPARATE - 1)).map((e) => ({ title: e.title, body: e.body, url: e.url }))
  const rest = events.length - shown.length
  return [
    {
      title: `${rest} more pull request update${rest === 1 ? '' : 's'}`,
      body: 'Click to see your pull requests on GitHub.',
      url: `https://${host}/pulls`
    },
    ...shown
  ]
}

export interface NotifierDeps {
  settings: () => Promise<NotificationSettings>
  accounts: () => Promise<{ account: ProviderAccount; creds: Credentials }[]>
  /** "owner/name" of GitHub repositories open in SillyGit, on the given host. */
  watchedRepos: (host: string) => Promise<string[]>
  show: (notification: ShownNotification) => void
  /** Where seen events are remembered. */
  statePath: string
  now?: () => Date
}

// Lets the window open and the network come up before the first check.
const FIRST_CHECK_DELAY_MS = 15 * 1000

export class PrNotifier {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<void> | null = null
  private stopped = true
  private lastError = new Map<string, string>()

  constructor(private readonly deps: NotifierDeps) {}

  /** Starts checking (again) with the current settings. */
  async restart(firstDelayMs = FIRST_CHECK_DELAY_MS): Promise<void> {
    this.stop()
    const settings = await this.deps.settings()
    if (!settings.enabled) {
      // Re-enabling later starts over instead of announcing the backlog.
      await this.writeState({})
      return
    }
    this.stopped = false
    this.schedule(firstDelayMs)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.checkNow().finally(async () => {
        const { intervalMinutes } = await this.deps.settings()
        this.schedule(intervalMinutes * 60 * 1000)
      })
    }, delayMs)
  }

  /** Checks every GitHub account once. Concurrent calls share one check. */
  checkNow(): Promise<void> {
    this.running ??= this.check().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async check(): Promise<void> {
    const settings = await this.deps.settings()
    if (!settings.enabled) return
    const state = await this.readState()
    const now = this.deps.now?.() ?? new Date()
    for (const { account, creds } of await this.deps.accounts()) {
      const key = `${account.host}/${account.username}`
      try {
        const repos = await this.deps.watchedRepos(account.host)
        const activity = await fetchPrActivity(creds, account.username, repos)
        const events = collectEvents(account.username, activity)
        const picked = pickNotifications(events, state[key], settings, account.username, now)
        state[key] = picked.state
        for (const n of toNotifications(picked.notify, account.host)) this.deps.show(n)
        this.lastError.delete(key)
      } catch (err) {
        // Offline or a revoked token: try again next time, and say so once.
        const message = err instanceof Error ? err.message : String(err)
        if (this.lastError.get(key) !== message) console.warn(`[notifications] ${key}: ${message}`)
        this.lastError.set(key, message)
      }
    }
    await this.writeState(state)
  }

  private async readState(): Promise<Record<string, SeenState>> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.deps.statePath, 'utf-8')) as { accounts?: Record<string, SeenState> }
      return parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {}
    } catch {
      return {}
    }
  }

  private async writeState(accounts: Record<string, SeenState>): Promise<void> {
    await fs.mkdir(dirname(this.deps.statePath), { recursive: true })
    await fs.writeFile(this.deps.statePath, JSON.stringify({ accounts }, null, 2), 'utf-8')
  }
}
