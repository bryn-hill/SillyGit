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

describe('branch cleanup', () => {
  const commit = (file: string): void => {
    writeFileSync(join(dir, file), `${file}\n`)
    run('add', '.')
    run('commit', '-q', '-m', file)
  }

  it('lists gone, merged and unpushed branches, leaving out current, default and brand-new ones', async () => {
    run('remote', 'set-head', 'origin', 'main')
    // done: merged into origin/main. gone: its upstream was deleted. wip: unpushed work.
    run('checkout', '-q', '-b', 'done')
    commit('done.txt')
    run('checkout', '-q', 'main')
    run('merge', '-q', '--no-ff', '-m', 'Merge done', 'done')
    run('push', '-q', 'origin', 'main')
    run('checkout', '-q', '-b', 'gone')
    commit('gone.txt')
    run('push', '-q', '-u', 'origin', 'gone')
    run('push', '-q', 'origin', '--delete', 'gone')
    run('fetch', '-q', '--prune')
    run('checkout', '-q', '-b', 'wip', 'main')
    commit('wip1.txt')
    commit('wip2.txt')
    run('checkout', '-q', 'main')
    run('branch', 'fresh')

    const found = await branches.listCleanupCandidates(dir)
    const byName = Object.fromEntries(found.map((c) => [c.name, c]))
    expect(Object.keys(byName).sort()).toEqual(['done', 'gone', 'wip'])
    expect(byName.done).toMatchObject({ gone: false, mergedInto: 'origin/main', localOnly: 0 })
    expect(byName.done.mergedVia).toMatchObject({ subject: 'Merge done', fastForward: false })
    expect(byName.done.mergedVia?.hash).toBe(run('rev-parse', 'main~0'))
    expect(byName.gone).toMatchObject({ gone: true, mergedInto: null, localOnly: 1 })
    expect(byName.wip).toMatchObject({ gone: false, mergedInto: null, localOnly: 2 })
    expect(byName.wip.lastCommitAt).toBeGreaterThan(0)
  })

  it('measures merged against a local main when the remote has no HEAD', async () => {
    run('branch', 'old', 'main')
    commit('next.txt')
    const found = await branches.listCleanupCandidates(dir)
    expect(found).toEqual([expect.objectContaining({ name: 'old', mergedInto: 'main' })])
  })

  it('finds the mainline commit each merged branch landed in', async () => {
    run('checkout', '-q', '-b', 'feat')
    commit('f1.txt')
    commit('f2.txt')
    run('checkout', '-q', 'main')
    commit('m1.txt')
    run('merge', '-q', '--no-ff', '-m', 'Merge pull request #7 from me/feat', 'feat')
    const mergeHash = run('rev-parse', 'HEAD')
    commit('m2.txt')
    run('checkout', '-q', '-b', 'quick')
    run('commit', '-q', '--allow-empty', '-m', 'Quick fix (#9)')
    const quickTip = run('rev-parse', 'HEAD')
    run('checkout', '-q', 'main')
    run('merge', '-q', '--ff-only', 'quick')
    commit('m3.txt')

    const found = await branches.listCleanupCandidates(dir)
    const byName = Object.fromEntries(found.map((c) => [c.name, c]))
    expect(byName.feat.mergedVia).toMatchObject({ hash: mergeHash, fastForward: false, pr: 7 })
    expect(byName.quick.mergedVia).toMatchObject({ hash: quickTip, fastForward: true, pr: 9, subject: 'Quick fix (#9)' })
  })

  it('deletes branches and restores them with their tracking config', async () => {
    run('checkout', '-q', '-b', 'topic')
    commit('topic.txt')
    run('push', '-q', '-u', 'origin', 'topic')
    run('checkout', '-q', 'main')
    const tip = run('rev-parse', 'topic')

    const result = await branches.deleteBranches(dir, ['topic', 'main', 'missing'])
    expect(result.deleted).toEqual([{ name: 'topic', hash: tip, remote: 'origin', merge: 'refs/heads/topic' }])
    // main is checked out and missing doesn't exist; both are reported, not fatal.
    expect(result.failed.map((f) => f.name)).toEqual(['main', 'missing'])
    expect(run('branch', '--list', 'topic')).toBe('')

    await branches.restoreBranches(dir, result.deleted)
    expect(run('rev-parse', 'topic')).toBe(tip)
    expect(run('rev-parse', '--abbrev-ref', 'topic@{upstream}')).toBe('origin/topic')
  })
})

describe('pullBranch', () => {
  // A second clone that pushes a new commit to `feature` on the remote.
  const pushFromElsewhere = (branch: string, file: string): void => {
    const other = join(root, `other-${file}`)
    execFileSync('git', ['clone', '-q', '-b', branch, remote, other])
    git(other, 'config', 'user.name', 'Bo')
    git(other, 'config', 'user.email', 'bo@example.com')
    writeFileSync(join(other, file), 'x\n')
    git(other, 'add', '.')
    git(other, 'commit', '-q', '-m', `Add ${file}`)
    git(other, 'push', '-q', 'origin', branch)
  }

  beforeEach(() => {
    run('push', '-q', 'origin', 'main:feature')
    run('fetch', '-q')
    run('branch', '--track', 'feature', 'origin/feature')
  })

  it('fast-forwards a branch that is not checked out, leaving HEAD alone', async () => {
    pushFromElsewhere('feature', 'f.txt')
    const remoteTip = git(remote, 'rev-parse', 'feature')

    expect(await branches.pullBranch(dir, 'feature')).toEqual({ updated: true })
    expect(run('rev-parse', 'feature')).toBe(remoteTip)
    expect(run('rev-parse', 'origin/feature')).toBe(remoteTip)
    expect(run('branch', '--show-current')).toBe('main')
    expect(await branches.pullBranch(dir, 'feature')).toEqual({ updated: false })
  })

  it('refuses a branch that has diverged from its upstream', async () => {
    pushFromElsewhere('feature', 'f.txt')
    run('checkout', '-q', 'feature')
    writeFileSync(join(dir, 'mine.txt'), 'mine\n')
    run('add', '.')
    run('commit', '-q', '-m', 'Mine')
    run('checkout', '-q', 'main')
    const before = run('rev-parse', 'feature')

    await expect(branches.pullBranch(dir, 'feature')).rejects.toThrow(
      /Can't pull feature without checking it out: it has commits that aren't on origin\/feature/
    )
    expect(run('rev-parse', 'feature')).toBe(before)
  })

  it('explains branches without an upstream or checked out in another worktree', async () => {
    run('branch', 'loner')
    await expect(branches.pullBranch(dir, 'loner')).rejects.toThrow(/doesn't track a remote branch/)

    pushFromElsewhere('feature', 'f.txt')
    run('worktree', 'add', '-q', join(root, 'wt'), 'feature')
    await expect(branches.pullBranch(dir, 'feature')).rejects.toThrow(/checked out in the worktree at/)
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
