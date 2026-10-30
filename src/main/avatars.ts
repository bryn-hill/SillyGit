import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'
import { httpFetch } from './http'
import type { ProviderAccount } from '../shared/accounts'
import type { AvatarRequest } from '../shared/types'

const MAX_IMAGE_BYTES = 512 * 1024
const AVATAR_SIZE = 64

/** Downloads an image; null when the server has none (404), throws on other failures. */
export async function downloadImage(
  url: string,
  headers: Record<string, string> = {}
): Promise<{ type: string; data: Buffer } | null> {
  const res = await httpFetch(url, { headers: { 'User-Agent': 'SillyGit', ...headers } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!type.startsWith('image/')) return null
  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > MAX_IMAGE_BYTES) return null
  return { type, data }
}

export async function downloadAsDataUrl(url: string, headers?: Record<string, string>): Promise<string | null> {
  const image = await downloadImage(url, headers)
  return image ? toDataUrl(image.type, image.data) : null
}

function toDataUrl(type: string, data: Buffer): string {
  return `data:${type};base64,${data.toString('base64')}`
}

function emailKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export function gravatarUrl(email: string): string {
  return `https://www.gravatar.com/avatar/${emailKey(email)}?s=${AVATAR_SIZE}&d=404`
}

/**
 * GitHub's private commit addresses name the account, so they need no
 * lookup: 1234+octocat@users.noreply.github.com (newer, by user id) or
 * octocat@users.noreply.github.com (older, by login).
 */
export function githubNoreplyAvatarUrl(email: string): string | null {
  const m = /^(?:(\d+)\+)?([a-z\d](?:[a-z\d-]*[a-z\d])?(?:\[bot\])?)@users\.noreply\.github\.com$/i.exec(email.trim())
  if (!m) return null
  if (m[1]) return `https://avatars.githubusercontent.com/u/${m[1]}?s=${AVATAR_SIZE}&v=4`
  return `https://github.com/${m[2]}.png?size=${AVATAR_SIZE}`
}

/** Bots whose commits get their official logo, bundled with the app. */
export type Bot = 'claude' | 'renovate'

const BOT_EMAILS: [RegExp, Bot][] = [
  // Claude Code commits, and the Claude GitHub app.
  [/^noreply@anthropic\.com$/, 'claude'],
  [/^(?:\d+\+)?claude\[bot\]@users\.noreply\.github\.com$/, 'claude'],
  // The Renovate GitHub app, and the addresses self-hosted Renovate commits as.
  [/^(?:\d+\+)?renovate(?:-bot)?(?:\[bot\])?@users\.noreply\.github\.com$/, 'renovate'],
  [/^bot@renovateapp\.com$/, 'renovate'],
  [/^renovate@whitesourcesoftware\.com$/, 'renovate']
]

/** The bot behind a commit email, if it's one with a bundled logo. */
export function botFor(email: string): Bot | null {
  const e = email.trim().toLowerCase()
  return BOT_EMAILS.find(([re]) => re.test(e))?.[1] ?? null
}

/** What the resolver may use for one repository. */
export interface AvatarSources {
  /** Signed-in accounts: commits made with their own emails get their avatar. */
  accounts: ProviderAccount[]
  /** Bundled bot logos as data: URLs; these win over any lookup (GitHub only has identicons for bot users). */
  bots?: Partial<Record<Bot, string>>
  /** Looks up the GitHub users behind commits, when the repo is on GitHub and an account is signed in there. */
  githubLookup?: (commits: Required<AvatarRequest>[]) => Promise<Map<string, string>>
  /** GitLab hosts to ask for an email's avatar, from the repo's remotes. */
  gitlabLookup?: (email: string) => Promise<string | null>
  /** Ask Gravatar. */
  gravatar: boolean
  /**
   * The Azure DevOps organization's picture for an email, asked after
   * Gravatar because it draws initials for everyone without a photo.
   */
  azureLookup?: (email: string) => Promise<{ url: string; headers: Record<string, string> } | null>
}

interface CacheEntry {
  /** File name inside the cache folder; absent when nobody has an avatar for the email. */
  file?: string
  type?: string
  fetchedAt: number
}

const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MISSING_TTL_MS = 24 * 60 * 60 * 1000
const DOWNLOAD_CONCURRENCY = 6

/**
 * Turns commit emails into avatar images (as data: URLs, so the renderer
 * needs no network access), trying the signed-in accounts, bundled bot logos, GitHub's noreply
 * addresses, GitHub commit authors, GitLab and Gravatar in that order. Images
 * and misses are cached on disk; misses are retried after a day.
 */
export class AvatarResolver {
  private index: Record<string, CacheEntry> | null = null
  private memory = new Map<string, string | null>()
  private saveTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now
  ) {}

  private async loadIndex(): Promise<Record<string, CacheEntry>> {
    if (this.index) return this.index
    try {
      this.index = JSON.parse(await fs.readFile(join(this.dir, 'index.json'), 'utf-8')) as Record<string, CacheEntry>
    } catch {
      this.index = {}
    }
    return this.index
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flush()
    }, 500)
  }

  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    if (!this.index) return
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(join(this.dir, 'index.json'), JSON.stringify(this.index), 'utf-8')
  }

  /** Forgets misses, e.g. after an account is added, so they're looked up again. */
  async forgetMisses(): Promise<void> {
    const index = await this.loadIndex()
    for (const [key, entry] of Object.entries(index)) if (!entry.file) delete index[key]
    for (const [key, value] of this.memory) if (value === null) this.memory.delete(key)
    this.scheduleSave()
  }

  private async cached(email: string): Promise<{ value: string | null; fresh: boolean } | undefined> {
    const key = emailKey(email)
    const index = await this.loadIndex()
    const entry = index[key]
    if (!entry) return undefined
    const fresh = this.now() - entry.fetchedAt < (entry.file ? FOUND_TTL_MS : MISSING_TTL_MS)
    if (this.memory.has(key)) return { value: this.memory.get(key) ?? null, fresh }
    if (!entry.file) return { value: null, fresh }
    try {
      const data = await fs.readFile(join(this.dir, entry.file))
      const value = toDataUrl(entry.type ?? 'image/png', data)
      this.memory.set(key, value)
      return { value, fresh }
    } catch {
      return undefined
    }
  }

  private async store(email: string, image: { type: string; data: Buffer } | null): Promise<string | null> {
    const key = emailKey(email)
    const index = await this.loadIndex()
    if (image) {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(join(this.dir, key), image.data)
      index[key] = { file: key, type: image.type, fetchedAt: this.now() }
    } else {
      index[key] = { fetchedAt: this.now() }
    }
    const value = image ? toDataUrl(image.type, image.data) : null
    this.memory.set(key, value)
    this.scheduleSave()
    return value
  }

  async resolve(requests: AvatarRequest[], sources: AvatarSources): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {}
    const todo: AvatarRequest[] = []
    const seen = new Set<string>()

    for (const req of requests) {
      const email = req.email.trim().toLowerCase()
      if (!email || seen.has(email)) continue
      seen.add(email)
      const own = sources.accounts.find((a) => a.avatar && a.emails.includes(email))
      if (own) {
        result[email] = own.avatar
        continue
      }
      const bot = botFor(email)
      const logo = bot && sources.bots?.[bot]
      if (logo) {
        result[email] = logo
        continue
      }
      const hit = await this.cached(email)
      if (hit) result[email] = hit.value
      if (!hit || !hit.fresh) todo.push({ email, hash: req.hash })
    }
    if (todo.length === 0) return result

    // Candidate image URLs, best source first.
    const urls = new Map<string, string>()
    for (const req of todo) {
      const noreply = githubNoreplyAvatarUrl(req.email)
      if (noreply) urls.set(req.email, noreply)
    }
    let lookupFailed = false
    const forGithub = todo.filter((r): r is Required<AvatarRequest> => !urls.has(r.email) && !!r.hash)
    if (sources.githubLookup && forGithub.length > 0) {
      try {
        for (const [email, url] of await sources.githubLookup(forGithub)) urls.set(email, url)
      } catch {
        lookupFailed = true
      }
    }

    await runLimited(todo, DOWNLOAD_CONCURRENCY, async (req) => {
      let failed = lookupFailed
      const candidates: (string | { url: string; headers: Record<string, string> })[] = []
      const known = urls.get(req.email)
      if (known) candidates.push(known)
      else {
        if (sources.gitlabLookup) {
          const url = await sources.gitlabLookup(req.email).catch(() => {
            failed = true
            return null
          })
          if (url) candidates.push(url)
        }
        if (sources.gravatar) candidates.push(gravatarUrl(req.email))
        if (sources.azureLookup) candidates.push({ url: '', headers: {} })
      }
      for (const candidate of candidates) {
        try {
          // The Azure DevOps lookup is only made once Gravatar has nothing.
          const found =
            typeof candidate === 'string' ? { url: candidate, headers: {} } : await sources.azureLookup?.(req.email)
          if (!found) continue
          const image = await downloadImage(found.url, found.headers)
          if (image) {
            result[req.email] = await this.store(req.email, image)
            return
          }
        } catch {
          failed = true
        }
      }
      // Offline or rate limited: keep whatever was cached and try again later.
      if (failed) {
        result[req.email] ??= null
        return
      }
      result[req.email] = await this.store(req.email, null)
    })
    return result
  }
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++])
  })
  await Promise.all(workers)
}
