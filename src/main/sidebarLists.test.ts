import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from './git'
import { parseSubmodules } from './git/sidebarLists'

let dir: string
let scratch: string

function run(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function newRepo(path: string): void {
  run(path, 'init', '-q', '-b', 'main')
  run(path, 'config', 'user.name', 'Ada Lovelace')
  run(path, 'config', 'user.email', 'ada@example.com')
  writeFileSync(join(path, 'a.txt'), 'a\n')
  run(path, 'add', '.')
  run(path, 'commit', '-q', '-m', 'First')
}

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'sillygit-lists-')))
  dir = join(scratch, 'repo')
  execFileSync('mkdir', [dir])
  newRepo(dir)
})

afterEach(() => rmSync(scratch, { recursive: true, force: true }))

describe('tags', () => {
  it('lists lightweight and annotated tags with the commit they point at', async () => {
    const head = run(dir, 'rev-parse', 'HEAD')
    run(dir, 'tag', 'light')
    run(dir, 'tag', '-a', 'v1.0', '-m', 'Release one')
    const tags = await git.listTags(dir)
    expect(tags.find((t) => t.name === 'v1.0')).toMatchObject({ hash: head, annotated: true, subject: 'Release one' })
    expect(tags.find((t) => t.name === 'light')).toMatchObject({ hash: head, annotated: false, subject: 'First' })
  })

  it('pushes and deletes a tag on the remote', async () => {
    const remote = join(scratch, 'remote.git')
    run(scratch, 'init', '-q', '--bare', remote)
    run(dir, 'remote', 'add', 'origin', remote)
    run(dir, 'tag', 'v1')
    await git.pushTag(dir, 'v1')
    expect(run(remote, 'tag')).toBe('v1')
    await git.deleteTag(dir, 'v1', true)
    expect(run(remote, 'tag')).toBe('')
    expect(run(dir, 'tag')).toBe('')
  })
})

describe('worktrees', () => {
  it('lists the main tree and linked ones, and removes a linked one', async () => {
    const linked = join(scratch, 'linked')
    run(dir, 'worktree', 'add', '-q', '-b', 'feature', linked)
    const list = await git.listWorktrees(dir)
    expect(list).toEqual([
      expect.objectContaining({ path: dir, branch: 'main', main: true, current: true }),
      expect.objectContaining({ path: linked, branch: 'feature', main: false, current: false, prunable: false })
    ])
    writeFileSync(join(linked, 'a.txt'), 'changed\n')
    await expect(git.removeWorktree(dir, linked, false)).rejects.toThrow(/uncommitted changes/)
    await git.removeWorktree(dir, linked, true)
    expect(existsSync(linked)).toBe(false)
    expect(await git.listWorktrees(dir)).toHaveLength(1)
  })

  it('marks a worktree whose folder is gone as prunable, and prunes it', async () => {
    const linked = join(scratch, 'gone')
    run(dir, 'worktree', 'add', '-q', '--detach', linked)
    rmSync(linked, { recursive: true, force: true })
    expect((await git.listWorktrees(dir))[1]).toMatchObject({ branch: null, prunable: true })
    await git.pruneWorktrees(dir)
    expect(await git.listWorktrees(dir)).toHaveLength(1)
  })
})

describe('submodules', () => {
  it('parses each state', () => {
    expect(
      parseSubmodules(
        [' 1111111 libs/ok (v1.0)', '-2222222 libs/new', '+3333333 libs/moved (heads/main)', 'U4444444 libs/conflict'].join('\n')
      )
    ).toEqual([
      { state: 'ok', hash: '1111111', path: 'libs/ok' },
      { state: 'uninitialized', hash: '2222222', path: 'libs/new' },
      { state: 'modified', hash: '3333333', path: 'libs/moved' },
      { state: 'conflict', hash: '4444444', path: 'libs/conflict' }
    ])
  })

  it('lists a submodule and checks it out', async () => {
    const lib = join(scratch, 'lib')
    execFileSync('mkdir', [lib])
    newRepo(lib)
    run(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, 'libs/lib')
    run(dir, 'commit', '-q', '-m', 'Add lib')
    expect(await git.listSubmodules(dir)).toEqual([expect.objectContaining({ path: 'libs/lib', state: 'ok' })])

    // A fresh clone has it registered but not checked out.
    const clone = join(scratch, 'clone')
    run(scratch, 'clone', '-q', dir, clone)
    expect(await git.listSubmodules(clone)).toEqual([expect.objectContaining({ path: 'libs/lib', state: 'uninitialized' })])
    process.env.GIT_CONFIG_COUNT = '1'
    process.env.GIT_CONFIG_KEY_0 = 'protocol.file.allow'
    process.env.GIT_CONFIG_VALUE_0 = 'always'
    try {
      await git.updateSubmodules(clone, 'libs/lib')
    } finally {
      delete process.env.GIT_CONFIG_COUNT
      delete process.env.GIT_CONFIG_KEY_0
      delete process.env.GIT_CONFIG_VALUE_0
    }
    expect(await git.listSubmodules(clone)).toEqual([expect.objectContaining({ path: 'libs/lib', state: 'ok' })])
  })
})
