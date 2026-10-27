import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { stopWatching, watchRepo } from './watcher'

// Real file system events, so these wait a little for the watcher's batching.
interface FakeContents {
  contents: WebContents
  sent: string[]
  destroy: () => void
  setDestroyed: (value: boolean) => void
}

let nextId = 1
function fakeContents(): FakeContents {
  const sent: string[] = []
  let destroyed = false
  let onDestroyed: (() => void) | null = null
  const contents = {
    id: nextId++,
    isDestroyed: () => destroyed,
    send: (channel: string, repoPath: string) => sent.push(`${channel} ${repoPath}`),
    once: (event: string, fn: () => void) => {
      if (event === 'destroyed') onDestroyed = fn
    }
  } as unknown as WebContents
  return {
    contents,
    sent,
    destroy: () => {
      destroyed = true
      onDestroyed?.()
    },
    setDestroyed: (value) => (destroyed = value)
  }
}

const settle = (ms = 500): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

let dir: string
let window: FakeContents

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-watch-'))
  mkdirSync(join(dir, '.git', 'objects', 'ab'), { recursive: true })
  mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true })
  mkdirSync(join(dir, 'src'))
  window = fakeContents()
})

afterEach(() => {
  stopWatching(window.contents)
  rmSync(dir, { recursive: true, force: true })
})

describe('watchRepo', () => {
  it('sends one change for a burst of edits', async () => {
    watchRepo(window.contents, dir)
    await settle(100)
    for (let i = 0; i < 5; i++) writeFileSync(join(dir, 'src', `f${i}.ts`), `${i}`)
    await vi.waitFor(() => expect(window.sent).toEqual([`repo:changed ${dir}`]), { timeout: 3000 })
    await settle(500)
    expect(window.sent).toHaveLength(1)
  })

  it('ignores busy git internals, lock files and dependency folders', async () => {
    watchRepo(window.contents, dir)
    await settle(100)
    writeFileSync(join(dir, '.git', 'objects', 'ab', 'cdef'), 'x')
    writeFileSync(join(dir, '.git', 'index.lock'), 'x')
    writeFileSync(join(dir, '.git', 'FETCH_HEAD'), 'x')
    writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), 'x')
    await settle()
    expect(window.sent).toEqual([])

    // A change git makes that matters, like moving HEAD, still gets through.
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    await vi.waitFor(() => expect(window.sent).toHaveLength(1), { timeout: 3000 })
  })

  it('stops sending after stopWatching and when the window goes away', async () => {
    watchRepo(window.contents, dir)
    await settle(100)
    stopWatching(window.contents)
    writeFileSync(join(dir, 'src', 'a.ts'), 'a')
    await settle()
    expect(window.sent).toEqual([])

    const other = fakeContents()
    watchRepo(other.contents, dir)
    await settle(100)
    other.destroy()
    writeFileSync(join(dir, 'src', 'b.ts'), 'b')
    await settle()
    expect(other.sent).toEqual([])
  })

  it("doesn't send to a window destroyed while a change was pending", async () => {
    watchRepo(window.contents, dir)
    await settle(100)
    writeFileSync(join(dir, 'src', 'a.ts'), 'a')
    window.setDestroyed(true)
    await settle()
    expect(window.sent).toEqual([])
  })

  it('moves to a new repo, and watching the same one twice changes nothing', async () => {
    const second = mkdtempSync(join(tmpdir(), 'sillygit-watch2-'))
    try {
      watchRepo(window.contents, dir)
      watchRepo(window.contents, dir)
      watchRepo(window.contents, second)
      await settle(100)
      writeFileSync(join(dir, 'old.txt'), 'x')
      await settle()
      expect(window.sent).toEqual([])
      writeFileSync(join(second, 'new.txt'), 'x')
      await vi.waitFor(() => expect(window.sent).toEqual([`repo:changed ${second}`]), { timeout: 3000 })
    } finally {
      rmSync(second, { recursive: true, force: true })
    }
  })

  it('logs and gives up on a folder it cannot watch', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    watchRepo(window.contents, join(dir, 'missing'))
    expect(error).toHaveBeenCalledWith('[watcher] could not watch', join(dir, 'missing'), expect.anything())
    error.mockRestore()
  })
})
