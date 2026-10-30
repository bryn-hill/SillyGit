import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBisectState } from './conflicts'
import { markBisect, resetBisect, startBisect } from './bisect'

let dir: string
let c: string[]

const run = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const head = (): string => run('rev-parse', 'HEAD')

// Eight commits; the value in value.txt goes wrong from the sixth (c[5]) on.
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-bisect-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada')
  run('config', 'user.email', 'ada@example.com')
  c = []
  for (let i = 0; i < 8; i++) {
    writeFileSync(join(dir, 'value.txt'), i >= 5 ? 'broken\n' : 'ok\n')
    writeFileSync(join(dir, `f${i}.txt`), `${i}\n`)
    run('add', '.')
    run('commit', '-q', '-m', `Commit ${i}`)
    c.push(head())
  }
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const isBroken = (): boolean => run('show', 'HEAD:value.txt') === 'broken'

describe('bisect', () => {
  it('has no state when no bisect is going', async () => {
    expect(await getBisectState(dir)).toBeNull()
  })

  it('starts from a bad commit and waits for a good one', async () => {
    const state = await startBisect(dir, c[7], 'bad')
    expect(state?.bad).toBe(c[7])
    expect(state?.good).toEqual([])
    expect(state?.startedFrom).toBe('main')
  })

  it('narrows down to the first bad commit, guided by the steps', async () => {
    await startBisect(dir, c[7], 'bad')
    let state = await startBisect(dir, c[0], 'good')
    expect(state?.current).toBe(head())
    expect(state?.remaining).toBe(6)
    expect(state?.stepsLeft).toBeGreaterThan(1)
    for (let i = 0; i < 10 && state && !state.firstBad; i++) {
      state = await markBisect(dir, isBroken() ? 'bad' : 'good')
    }
    expect(state?.firstBad).toBe(c[5])
    expect(state?.firstBadLabel).toMatch(/Commit 5$/)
  })

  it('reports the suspects when only skipped commits are left', async () => {
    await startBisect(dir, c[7], 'bad')
    let state = await startBisect(dir, c[0], 'good')
    for (let i = 0; i < 10 && state && state.suspects.length === 0 && !state.firstBad; i++) {
      state = await markBisect(dir, 'skip')
    }
    expect(state?.firstBad).toBeNull()
    expect(state?.suspects.length).toBe(7)
  })

  it('marks a commit other than the checked-out one', async () => {
    await startBisect(dir, c[7], 'bad')
    await startBisect(dir, c[0], 'good')
    const state = await markBisect(dir, 'good', c[4])
    expect(state?.good).toContain(c[4])
    expect(state?.remaining).toBe(2)
  })

  it('resets back to the branch it started from', async () => {
    await startBisect(dir, c[7], 'bad')
    await startBisect(dir, c[0], 'good')
    await resetBisect(dir)
    expect(await getBisectState(dir)).toBeNull()
    expect(run('symbolic-ref', '--short', 'HEAD')).toBe('main')
  })

  it('refuses to mark with no bisect going', async () => {
    await expect(markBisect(dir, 'good')).rejects.toThrow(/No bisect/)
  })
})
