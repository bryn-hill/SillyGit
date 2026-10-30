import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compareRefs, getCompareFileDiff } from './git'

let dir: string

const run = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const commit = (file: string, content: string, message: string): void => {
  writeFileSync(join(dir, file), content)
  run('add', '.')
  run('commit', '-q', '-m', message)
}

// main: base, "Main fix"; feature (from base): "Feature one", "Feature two".
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-compare-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada')
  run('config', 'user.email', 'ada@example.com')
  commit('shared.txt', 'one\ntwo\n', 'Base')
  run('checkout', '-q', '-b', 'feature')
  commit('shared.txt', 'one\nTWO\n', 'Feature one')
  commit('feature.txt', 'new\n', 'Feature two')
  run('checkout', '-q', 'main')
  commit('main.txt', 'fix\n', 'Main fix')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('compareRefs', () => {
  it('lists the differing files and each side’s own commits', async () => {
    const result = await compareRefs(dir, 'main', 'feature')
    expect(result.fromHash).toBe(run('rev-parse', 'main'))
    expect(result.toHash).toBe(run('rev-parse', 'feature'))
    expect(result.mergeBase).toBe(run('rev-parse', 'main~1'))
    expect(result.files).toEqual([
      { status: 'A', path: 'feature.txt' },
      { status: 'D', path: 'main.txt' },
      { status: 'M', path: 'shared.txt' }
    ])
    expect(result.onlyFrom.map((c) => c.subject)).toEqual(['Main fix'])
    expect(result.onlyTo.map((c) => c.subject)).toEqual(['Feature two', 'Feature one'])
    expect(result.truncated).toBe(false)
  })

  it('compares commits by SHA too', async () => {
    const result = await compareRefs(dir, run('rev-parse', 'feature~1'), run('rev-parse', 'feature'))
    expect(result.files.map((f) => f.path)).toEqual(['feature.txt'])
    expect(result.onlyFrom).toEqual([])
    expect(result.onlyTo.map((c) => c.subject)).toEqual(['Feature two'])
  })

  it('says which side it cannot find, and never reads a ref as an option', async () => {
    await expect(compareRefs(dir, 'main', 'nope')).rejects.toThrow("Can't find nope to compare.")
    await expect(compareRefs(dir, '--all', 'main')).rejects.toThrow("Can't find --all to compare.")
  })
})

describe('getCompareFileDiff', () => {
  it('diffs one file between the two commits', async () => {
    const diff = await getCompareFileDiff(dir, run('rev-parse', 'main'), run('rev-parse', 'feature'), 'shared.txt')
    expect(diff).toContain('-two')
    expect(diff).toContain('+TWO')
  })
})
