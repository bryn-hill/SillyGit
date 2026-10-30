import { useEffect, useSyncExternalStore } from 'react'
import type { AvatarRequest } from '../../../shared/types'

/**
 * Avatar images by lower-cased email, shared by every avatar on screen.
 * Requests made in the same moment go to the main process as one batch, and
 * an email is only ever asked for once (until reset).
 */
const images = new Map<string, string | null>()
// Each email asked for, and whether it was asked with a commit (so GitHub could look up its author).
const requested = new Map<string, boolean>()
const queues = new Map<string, Map<string, AvatarRequest>>()
const listeners = new Set<() => void>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
// Bumped by resetAvatars, so every avatar on screen asks again.
let generation = 0

const BATCH_SIZE = 100

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function flush(): Promise<void> {
  flushTimer = null
  const pending = [...queues]
  queues.clear()
  for (const [repoPath, queue] of pending) {
    const all = [...queue.values()]
    for (let i = 0; i < all.length; i += BATCH_SIZE) {
      const batch = all.slice(i, i + BATCH_SIZE)
      const res = await window.api.resolveAvatars(repoPath, batch)
      for (const req of batch) images.set(req.email, res.ok ? (res.data[req.email] ?? null) : null)
      notify()
    }
  }
}

function request(repoPath: string, email: string, hash: string | undefined): void {
  // A co-author is asked for without a commit; if they turn up as an author
  // later and nothing was found, ask again with their commit.
  const asked = requested.get(email)
  if (asked === true || (asked === false && (!hash || images.get(email) !== null))) return
  requested.set(email, !!hash)
  let queue = queues.get(repoPath)
  if (!queue) queues.set(repoPath, (queue = new Map()))
  queue.set(email, hash ? { email, hash } : { email })
  flushTimer ??= setTimeout(() => void flush(), 30)
}

/** Drops every image so they're looked up again, e.g. after signing in or turning avatars on. */
export function resetAvatars(): void {
  images.clear()
  requested.clear()
  generation++
  notify()
}

/** The avatar image for an email (a data: URL), or null while loading or when there is none. */
export function useAvatar(repoPath: string | undefined, email: string | undefined, hash: string | undefined): string | null {
  const key = email?.trim().toLowerCase() ?? ''
  const image = useSyncExternalStore(subscribe, () => (key ? (images.get(key) ?? null) : null))
  const gen = useSyncExternalStore(subscribe, () => generation)
  useEffect(() => {
    if (repoPath && key) request(repoPath, key, hash)
  }, [repoPath, key, hash, gen])
  return image
}

/** Up to two initials, e.g. "Ada Lovelace" -> "AL", "octocat" -> "O". */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = [...words[0]][0] ?? ''
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** A steady colour per person, so the same author always gets the same initials badge. */
export function initialsColor(seed: string): string {
  let hash = 0
  for (const ch of seed.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) | 0
  return `hsl(${Math.abs(hash) % 360}, 45%, 42%)`
}
