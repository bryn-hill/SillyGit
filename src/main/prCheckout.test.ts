import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The remotes here are folders, which don't parse as GitHub URLs, so each
// test says which GitHub repository its remotes stand for.
const fake = vi.hoisted(() => ({ locations: [] as { remote: string; host: string; path: string }[] }))
vi.mock('./hosting', () => ({ remoteLocations: async () => fake.locations }))

import { checkoutPullRequestHead } from './prCheckout'
import type { PullRequestHead } from '../shared/prCheckout'

let root: string
let dir: string
let base: string
let fork: string
let author: string

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
const run = (...args: string[]): string => git(dir, ...args)

/** Commits `file` in the author's clone and returns the new commit. */
function authorCommit(file: string): string {
  writeFileSync(join(author, file), `${file}\n`)
  git(author, 'add', '.')
  git(author, 'commit', '-q', '-m', `Add ${file}`)
  return git(author, 'rev-parse', 'HEAD')
}

/** Publishes the author's HEAD as `branch` on `repo` and as pull request `number` on the base repository. */
function openPullRequest(number: number, branch: string, repo = base): void {
  git(author, 'push', '-q', '-f', repo, `HEAD:refs/heads/${branch}`)
  git(author, 'push', '-q', '-f', base, `HEAD:refs/pull/${number}/head`)
}

const sameRepoPr = (number: number, headRefName: string): PullRequestHead => ({
  number,
  host: 'github.com',
  baseRepo: { owner: 'bryn', name: 'app' },
  headRepo: { owner: 'bryn', name: 'app' },
  headRefName
})

const forkPr = (number: number, headRefName: string, headRepo: PullRequestHead['headRepo'] = { owner: 'junior', name: 'app' }): PullRequestHead => ({
  ...sameRepoPr(number, headRefName),
  headRepo
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sillygit-pr-checkout-'))
  base = join(root, 'base.git')
  fork = join(root, 'fork.git')
  dir = join(root, 'work')
  author = join(root, 'author')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', base])
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', fork])
  execFileSync('git', ['init', '-q', '-b', 'main', author])
  for (const cwd of [author]) {
    git(cwd, 'config', 'user.name', 'Junior')
    git(cwd, 'config', 'user.email', 'junior@example.com')
  }
  authorCommit('readme')
  git(author, 'push', '-q', base, 'main')
  execFileSync('git', ['clone', '-q', base, dir])
  run('config', 'user.name', 'Ada')
  run('config', 'user.email', 'ada@example.com')
  fake.locations = [{ remote: 'origin', host: 'github.com', path: 'bryn/app' }]
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('checkoutPullRequestHead', () => {
  it('makes a branch named after the head branch, tracking it on the remote', async () => {
    git(author, 'checkout', '-q', '-b', 'feature/login')
    const sha = authorCommit('login')
    openPullRequest(7, 'feature/login')

    const result = await checkoutPullRequestHead(dir, sameRepoPr(7, 'feature/login'))

    expect(result).toEqual({ branch: 'feature/login', created: true, updated: false, diverged: false, upstream: 'origin/feature/login' })
    expect(run('branch', '--show-current')).toBe('feature/login')
    expect(run('rev-parse', 'HEAD')).toBe(sha)
    expect(run('rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/feature/login')
  })

  it('switches to the branch next time and fast-forwards it to new commits', async () => {
    git(author, 'checkout', '-q', '-b', 'feature/login')
    authorCommit('login')
    openPullRequest(7, 'feature/login')
    await checkoutPullRequestHead(dir, sameRepoPr(7, 'feature/login'))
    run('checkout', '-q', 'main')

    const sha = authorCommit('more')
    openPullRequest(7, 'feature/login')
    const result = await checkoutPullRequestHead(dir, sameRepoPr(7, 'feature/login'))

    expect(result).toMatchObject({ branch: 'feature/login', created: false, updated: true, diverged: false })
    expect(run('branch', '--show-current')).toBe('feature/login')
    expect(run('rev-parse', 'HEAD')).toBe(sha)
  })

  it('fast-forwards the checked-out branch in place', async () => {
    git(author, 'checkout', '-q', '-b', 'topic')
    authorCommit('one')
    openPullRequest(4, 'topic')
    await checkoutPullRequestHead(dir, sameRepoPr(4, 'topic'))

    const sha = authorCommit('two')
    openPullRequest(4, 'topic')
    expect(await checkoutPullRequestHead(dir, sameRepoPr(4, 'topic'))).toMatchObject({ updated: true })
    expect(run('rev-parse', 'HEAD')).toBe(sha)
  })

  it('reuses a branch that already tracks the head branch', async () => {
    git(author, 'checkout', '-q', '-b', 'topic')
    const first = authorCommit('one')
    openPullRequest(4, 'topic')
    run('fetch', '-q')
    run('checkout', '-q', '--track', 'origin/topic')
    run('checkout', '-q', 'main')

    const sha = authorCommit('two')
    openPullRequest(4, 'topic')
    expect(run('rev-parse', 'topic')).toBe(first)
    expect(await checkoutPullRequestHead(dir, sameRepoPr(4, 'topic'))).toMatchObject({ branch: 'topic', created: false, updated: true })
    expect(run('rev-parse', 'HEAD')).toBe(sha)
  })

  it("leaves a branch that has commits of its own where it is", async () => {
    git(author, 'checkout', '-q', '-b', 'topic')
    authorCommit('one')
    openPullRequest(4, 'topic')
    await checkoutPullRequestHead(dir, sameRepoPr(4, 'topic'))
    writeFileSync(join(dir, 'mine.txt'), 'mine\n')
    run('add', '.')
    run('commit', '-q', '-m', 'Mine')
    const mine = run('rev-parse', 'HEAD')
    run('checkout', '-q', 'main')

    authorCommit('two')
    openPullRequest(4, 'topic')
    const result = await checkoutPullRequestHead(dir, sameRepoPr(4, 'topic'))
    expect(result).toMatchObject({ branch: 'topic', updated: false, diverged: true })
    expect(run('branch', '--show-current')).toBe('topic')
    expect(run('rev-parse', 'HEAD')).toBe(mine)
  })

  it("checks out a fork's pull request from the pull ref, without an upstream", async () => {
    git(author, 'checkout', '-q', '-b', 'fix-typo')
    const sha = authorCommit('typo')
    openPullRequest(12, 'fix-typo', fork)

    const result = await checkoutPullRequestHead(dir, forkPr(12, 'fix-typo'))

    expect(result).toEqual({ branch: 'fix-typo', created: true, updated: false, diverged: false, upstream: null })
    expect(run('rev-parse', 'HEAD')).toBe(sha)
    expect(() => run('rev-parse', '--abbrev-ref', '@{upstream}')).toThrow()

    // Made for #12, so it's reused (and updated) next time though it tracks nothing.
    run('checkout', '-q', 'main')
    const next = authorCommit('typo2')
    openPullRequest(12, 'fix-typo', fork)
    expect(await checkoutPullRequestHead(dir, forkPr(12, 'fix-typo'))).toMatchObject({ branch: 'fix-typo', created: false, updated: true })
    expect(run('rev-parse', 'HEAD')).toBe(next)
  })

  it("names a fork's branch owner/branch when the plain name is taken", async () => {
    const sha = authorCommit('from-fork-main')
    openPullRequest(5, 'main', fork)

    const result = await checkoutPullRequestHead(dir, forkPr(5, 'main'))

    expect(result).toMatchObject({ branch: 'junior/main', created: true })
    expect(run('rev-parse', 'HEAD')).toBe(sha)
    expect(run('rev-parse', 'main')).not.toBe(sha)
  })

  it("falls back to pr/<number> when the fork is gone and the name is taken", async () => {
    authorCommit('orphan')
    openPullRequest(6, 'main', fork)
    expect(await checkoutPullRequestHead(dir, forkPr(6, 'main', null))).toMatchObject({ branch: 'pr/6', created: true })
  })

  it("tracks the fork's branch when the fork is one of the repo's remotes", async () => {
    run('remote', 'add', 'junior', fork)
    fake.locations.push({ remote: 'junior', host: 'github.com', path: 'Junior/App' })
    git(author, 'checkout', '-q', '-b', 'speedup')
    authorCommit('fast')
    openPullRequest(8, 'speedup', fork)

    const result = await checkoutPullRequestHead(dir, forkPr(8, 'speedup'))
    expect(result).toMatchObject({ branch: 'speedup', upstream: 'junior/speedup' })
    expect(run('rev-parse', '--abbrev-ref', '@{upstream}')).toBe('junior/speedup')
  })

  it('finds the base repository by its remote rather than assuming origin', async () => {
    run('remote', 'rename', 'origin', 'upstream')
    run('remote', 'add', 'origin', fork)
    fake.locations = [
      { remote: 'origin', host: 'github.com', path: 'ada/app' },
      { remote: 'upstream', host: 'github.com', path: 'bryn/app' }
    ]
    git(author, 'checkout', '-q', '-b', 'feature')
    const sha = authorCommit('feature')
    openPullRequest(3, 'feature')

    expect(await checkoutPullRequestHead(dir, sameRepoPr(3, 'feature'))).toMatchObject({ upstream: 'upstream/feature' })
    expect(run('rev-parse', 'HEAD')).toBe(sha)
  })

  it("explains a pull request the remote doesn't have", async () => {
    await expect(checkoutPullRequestHead(dir, sameRepoPr(99, 'nope'))).rejects.toThrow('origin has no refs/pull/99/head')
  })
})
