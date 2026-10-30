import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { runGit } from './gitExec'

let repo: string

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

/** A clone of a repo whose main has moved on since, so fetching and pulling have work to do. */
function cloneBehindOrigin(): string {
  repo = mkdtempSync(join(tmpdir(), 'sillygit-gitexec-'))
  const origin = join(repo, 'origin')
  const clone = join(repo, 'clone')
  const git = (cwd: string, ...args: string[]): void => {
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd })
  }
  execFileSync('git', ['init', '-q', '-b', 'main', origin])
  writeFileSync(join(origin, 'a.txt'), 'one\n')
  git(origin, 'add', '.')
  git(origin, 'commit', '-qm', 'one')
  execFileSync('git', ['clone', '-q', origin, clone])
  writeFileSync(join(origin, 'a.txt'), 'two\n')
  git(origin, 'commit', '-qam', 'two')
  return clone
}

const originMain = (clone: string): string =>
  execFileSync('git', ['rev-parse', 'origin/main'], { cwd: clone, encoding: 'utf8' }).trim()

describe('runGit', () => {
  it('runs commands that change a repo one at a time, so they never meet on index.lock', async () => {
    repo = mkdtempSync(join(tmpdir(), 'sillygit-gitexec-'))
    execFileSync('git', ['init', '-q'], { cwd: repo })
    const files = Array.from({ length: 30 }, (_, i) => `file-${i}.txt`)
    for (const file of files) writeFileSync(join(repo, file), `${file}\n`)

    await Promise.all(files.map((file) => runGit(repo, ['add', '--', file])))

    expect(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').sort()).toEqual(
      [...files].sort()
    )
  })

  it('runs fetches and pulls one at a time, so they never meet on a remote-tracking ref lock', async () => {
    const clone = cloneBehindOrigin()
    await Promise.all([
      runGit(clone, ['fetch', '--all', '--prune', '--quiet']),
      runGit(clone, ['pull', '--ff-only']),
      runGit(clone, ['fetch', '--all', '--prune', '--quiet']),
      runGit(clone, ['pull', '--ff-only'])
    ])
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: clone, encoding: 'utf8' }).trim()).toBe(originMain(clone))
  })

  it('tries a fetch again when git outside the app holds the ref lock for a moment', async () => {
    const clone = cloneBehindOrigin()
    const lock = join(clone, '.git', 'refs', 'remotes', 'origin', 'main.lock')
    writeFileSync(lock, '')
    setTimeout(() => rmSync(lock, { force: true }), 400)

    await runGit(clone, ['fetch', '--quiet', 'origin'])

    expect(existsSync(lock)).toBe(false)
    expect(originMain(clone)).toBe(execFileSync('git', ['rev-parse', 'main'], { cwd: join(repo, 'origin'), encoding: 'utf8' }).trim())
  })

  it('still reports a ref lock that never clears', async () => {
    const clone = cloneBehindOrigin()
    writeFileSync(join(clone, '.git', 'refs', 'remotes', 'origin', 'main.lock'), '')
    await expect(runGit(clone, ['fetch', '--quiet', 'origin'])).rejects.toThrow(/cannot lock ref/)
  })
})
