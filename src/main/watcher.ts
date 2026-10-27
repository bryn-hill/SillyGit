import { watch, type FSWatcher } from 'fs'
import { sep } from 'path'
import type { WebContents } from 'electron'

/**
 * Watches the open repository (working tree and .git) and tells the window
 * when something changed outside SillyGit, e.g. a commit from the terminal,
 * an editor save or a checkout in another tool. Changes are batched so a
 * burst (a build, a big checkout) causes one refresh.
 */

const QUIET_MS = 300
const MAX_WAIT_MS = 2000

// Busy paths inside .git that don't change what SillyGit shows.
function ignored(relative: string): boolean {
  const path = relative.split(sep).join('/')
  if (path.endsWith('.lock')) return true
  if (path.startsWith('.git/objects/') || path.startsWith('.git/logs/')) return true
  if (path === '.git/FETCH_HEAD' || path.startsWith('.git/fsmonitor')) return true
  // Big dependency and build folders churn without being interesting.
  return /(^|\/)(node_modules|\.cache)\//.test(path)
}

interface Watch {
  repoPath: string
  watcher: FSWatcher
  timer: ReturnType<typeof setTimeout> | null
  firstEventAt: number
}

const watches = new Map<number, Watch>()
const cleanupHooked = new WeakSet<WebContents>()

export function stopWatching(contents: WebContents): void {
  const current = watches.get(contents.id)
  if (!current) return
  current.watcher.close()
  if (current.timer) clearTimeout(current.timer)
  watches.delete(contents.id)
}

export function watchRepo(contents: WebContents, repoPath: string): void {
  if (watches.get(contents.id)?.repoPath === repoPath) return
  stopWatching(contents)

  let watcher: FSWatcher
  try {
    watcher = watch(repoPath, { recursive: true, persistent: false })
  } catch (err) {
    console.error('[watcher] could not watch', repoPath, err)
    return
  }
  const entry: Watch = { repoPath, watcher, timer: null, firstEventAt: 0 }
  watches.set(contents.id, entry)

  const fire = (): void => {
    entry.timer = null
    entry.firstEventAt = 0
    if (!contents.isDestroyed()) contents.send('repo:changed', repoPath)
  }

  watcher.on('change', (_event, filename) => {
    if (filename && ignored(String(filename))) return
    const now = Date.now()
    if (!entry.firstEventAt) entry.firstEventAt = now
    if (entry.timer) clearTimeout(entry.timer)
    // Keep waiting for the burst to settle, but never longer than MAX_WAIT_MS.
    const wait = Math.max(0, Math.min(QUIET_MS, entry.firstEventAt + MAX_WAIT_MS - now))
    entry.timer = setTimeout(fire, wait)
  })
  watcher.on('error', (err) => {
    console.error('[watcher]', err)
    stopWatching(contents)
  })

  if (!cleanupHooked.has(contents)) {
    cleanupHooked.add(contents)
    contents.once('destroyed', () => stopWatching(contents))
  }
}
