import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// No signed-in accounts, so nothing here reaches GitHub.
const signedIn = vi.hoisted(() => ({ hosts: new Set<string>() }))
vi.mock('./accounts', () => ({
  credentialsFor: async (host: string) =>
    signedIn.hosts.has(host)
      ? {
          account: { id: '1', provider: 'github', host, username: 'ada', displayName: 'Ada', avatar: null, emails: [], addedAt: '' },
          creds: { provider: 'github', host, token: 't' }
        }
      : null
}))

import * as branches from './branches'
import { githubAccess, remoteLocations } from './hosting'

let root: string
let dir: string
let remote: string

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const run = (...args: string[]): string => git(dir, ...args)

beforeEach(() => {
  signedIn.hosts.clear()
  root = mkdtempSync(join(tmpdir(), 'sillygit-branches-'))
  remote = join(root, 'remote.git')
  dir = join(root, 'work')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  execFileSync('git', ['init', '-q', '-b', 'main', dir])
  run('config', 'user.name', 'Ada')
  run('config', 'user.email', 'ada@example.com')
  writeFileSync(join(dir, 'a.txt'), 'a\n')
  run('add', '.')
  run('commit', '-q', '-m', 'First')
  run('remote', 'add', 'origin', remote)
  run('push', '-q', '-u', 'origin', 'main')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('checkoutRemoteBranch', () => {
  it('creates a tracking branch the first time and switches to it after', async () => {
    run('push', '-q', 'origin', 'main:feature/login')
    run('fetch', '-q')
    await branches.checkoutRemoteBranch(dir, 'origin/feature/login')
    expect(run('branch', '--show-current')).toBe('feature/login')
    expect(run('rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/feature/login')

    run('checkout', '-q', 'main')
    await branches.checkoutRemoteBranch(dir, 'origin/feature/login')
    expect(run('branch', '--show-current')).toBe('feature/login')
  })

  it('picks the longest matching remote name', async () => {
    run('remote', 'add', 'team/fork', remote)
    run('push', '-q', 'origin', 'main:topic')
    run('fetch', '-q', 'team/fork')
    await branches.checkoutRemoteBranch(dir, 'team/fork/topic')
    expect(run('branch', '--show-current')).toBe('topic')
    expect(run('rev-parse', '--abbrev-ref', '@{upstream}')).toBe('team/fork/topic')
  })

  it('checks out a plain name when it is not on a remote', async () => {
    run('branch', 'local-only')
    await branches.checkoutRemoteBranch(dir, 'local-only')
    expect(run('branch', '--show-current')).toBe('local-only')
  })
})

describe('branch commands', () => {
  it('renames and deletes local branches, forcing only when asked', async () => {
    run('checkout', '-q', '-b', 'old')
    writeFileSync(join(dir, 'b.txt'), 'b\n')
    run('add', '.')
    run('commit', '-q', '-m', 'Unmerged')
    run('checkout', '-q', 'main')

    await branches.renameBranch(dir, 'old', 'new')
    expect(run('branch', '--list', 'new')).toContain('new')
    await expect(branches.deleteBranch(dir, 'new', false)).rejects.toThrow(/not fully merged/)
    await branches.deleteBranch(dir, 'new', true)
    expect(run('branch', '--list', 'new')).toBe('')
  })

  it('deletes a branch from its remote', async () => {
    run('push', '-q', 'origin', 'main:doomed')
    await branches.deleteRemoteBranch(dir, 'origin/doomed')
    expect(git(remote, 'branch', '--list', 'doomed')).toBe('')
    await expect(branches.deleteRemoteBranch(dir, 'nowhere/doomed')).rejects.toThrow(/isn't on a known remote/)
  })

  it('lists remotes with their web URLs', async () => {
    run('remote', 'add', 'upstream', 'git@github.com:owner/repo.git')
    expect(await branches.listRepoRemotes(dir)).toEqual([
      { name: 'origin', webUrl: null },
      { name: 'upstream', webUrl: 'https://github.com/owner/repo' }
    ])
  })
})

describe('addWorktree', () => {
  it('checks out a local branch, a remote branch and a commit', async () => {
    run('branch', 'side')
    run('push', '-q', 'origin', 'main:remote-only')
    run('fetch', '-q')
    const head = run('rev-parse', 'HEAD')

    await branches.addWorktree(dir, join(root, 'wt-local'), 'side', 'local')
    expect(git(join(root, 'wt-local'), 'branch', '--show-current')).toBe('side')

    await branches.addWorktree(dir, join(root, 'wt-remote'), 'origin/remote-only', 'remote')
    expect(git(join(root, 'wt-remote'), 'branch', '--show-current')).toBe('remote-only')
    expect(git(join(root, 'wt-remote'), 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/remote-only')

    await branches.addWorktree(dir, join(root, 'wt-commit'), head, 'commit')
    expect(git(join(root, 'wt-commit'), 'branch', '--show-current')).toBe('')
    expect(git(join(root, 'wt-commit'), 'rev-parse', 'HEAD')).toBe(head)
  })

  it('reuses the local branch for a remote branch that already has one', async () => {
    run('push', '-q', 'origin', 'main:shared')
    run('fetch', '-q')
    run('branch', 'shared', 'origin/shared')
    await branches.addWorktree(dir, join(root, 'wt'), 'origin/shared', 'remote')
    expect(git(join(root, 'wt'), 'branch', '--show-current')).toBe('shared')
  })
})

describe('hosting', () => {
  it('lists where the remotes live, origin first', async () => {
    run('remote', 'remove', 'origin')
    run('remote', 'add', 'fork', 'https://gitlab.com/me/fork.git')
    run('remote', 'add', 'origin', 'git@github.com:owner/repo.git')
    run('remote', 'add', 'local', '/some/path')
    expect(await remoteLocations(dir)).toEqual([
      { remote: 'origin', host: 'github.com', path: 'owner/repo' },
      { remote: 'fork', host: 'gitlab.com', path: 'me/fork' }
    ])
  })

  it('is empty outside a repo', async () => {
    expect(await remoteLocations(root)).toEqual([])
  })

  it('finds GitHub access only for a signed-in host', async () => {
    run('remote', 'set-url', 'origin', 'https://github.example.com/owner/repo.git')
    expect(await githubAccess(dir)).toBeNull()
    signedIn.hosts.add('github.example.com')
    expect(await githubAccess(dir)).toMatchObject({
      repo: { host: 'github.example.com', owner: 'owner', name: 'repo' },
      account: { username: 'ada' }
    })
  })

  it("skips remotes that aren't owner/name repos", async () => {
    run('remote', 'set-url', 'origin', 'https://gitlab.com/group/sub/repo.git')
    signedIn.hosts.add('gitlab.com')
    expect(await githubAccess(dir)).toBeNull()
  })
})
