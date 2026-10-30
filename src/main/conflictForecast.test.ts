import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { conflictingFiles, forecastConflicts } from './conflictForecast'

// Real repositories: the answer is whatever git's trial merge says.

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function commit(file: string, content: string, message: string): void {
  writeFileSync(join(dir, file), content)
  run('add', file)
  run('commit', '-q', '-m', message)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-forecast-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  commit('a.txt', 'one\n', 'First')
  commit('b.txt', 'bee\n', 'Second')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('conflict forecast', () => {
  it('flags a branch that changed the same lines as main, and leaves a clean one alone', async () => {
    run('checkout', '-q', '-b', 'clash')
    commit('a.txt', 'clash\n', 'Clash')
    run('checkout', '-q', '-b', 'clean', 'main')
    commit('c.txt', 'new\n', 'Clean')
    run('checkout', '-q', 'main')
    commit('a.txt', 'main\n', 'Main moves on')

    expect(await forecastConflicts(dir)).toEqual({
      clash: [{ with: 'main', kind: 'target', files: ['a.txt'] }]
    })
    // Nothing in the repo changed.
    expect(run('status', '--porcelain')).toBe('')
    expect(run('rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('checks other branches against the one checked out', async () => {
    run('checkout', '-q', '-b', 'mine')
    commit('b.txt', 'mine\n', 'Mine')
    run('checkout', '-q', '-b', 'theirs', 'main')
    commit('b.txt', 'theirs\n', 'Theirs')
    run('checkout', '-q', 'mine')

    expect(await forecastConflicts(dir)).toEqual({
      theirs: [{ with: 'mine', kind: 'current', files: ['b.txt'] }]
    })
  })

  it('compares against the remote default branch when there is one', async () => {
    const remote = mkdtempSync(join(tmpdir(), 'sillygit-forecast-remote-'))
    try {
      execFileSync('git', ['init', '-q', '--bare', remote])
      run('remote', 'add', 'origin', remote)
      run('push', '-q', '-u', 'origin', 'main')
      run('remote', 'set-head', 'origin', 'main')
      run('checkout', '-q', '-b', 'feature')
      commit('a.txt', 'feature\n', 'Feature')
      // Someone else changes a.txt on origin/main.
      run('checkout', '-q', 'main')
      commit('a.txt', 'upstream\n', 'Upstream')
      run('push', '-q', 'origin', 'main')
      run('reset', '-q', '--hard', 'HEAD~1')
      run('checkout', '-q', 'feature')

      const forecast = await forecastConflicts(dir)
      expect(forecast?.feature).toEqual([{ with: 'origin/main', kind: 'target', files: ['a.txt'] }])
      // Local main is behind origin/main, which is a pull, not a conflict.
      expect(forecast?.main).toBeUndefined()
    } finally {
      rmSync(remote, { recursive: true, force: true })
    }
  })

  it('answers the same pair from its cache', async () => {
    run('checkout', '-q', '-b', 'x')
    commit('a.txt', 'x\n', 'X')
    const x = run('rev-parse', 'HEAD')
    run('checkout', '-q', 'main')
    commit('a.txt', 'y\n', 'Y')
    const y = run('rev-parse', 'HEAD')
    const first = await conflictingFiles(dir, x, y)
    expect(first).toEqual(['a.txt'])
    expect(await conflictingFiles(dir, y, x)).toBe(first)
  })
})
