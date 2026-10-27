import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from './git'

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function commitFile(name: string, content: string, message: string): void {
  writeFileSync(join(dir, name), content)
  run('add', name)
  run('commit', '-q', '-m', message)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-history-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  commitFile('a.txt', 'one\n', 'First')
  commitFile('a.txt', 'two\n', 'Second')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('undo', () => {
  it('undoes a commit and keeps its changes staged', async () => {
    commitFile('b.txt', 'b\n', 'Add b')
    expect(await git.undoLabel(dir)).toBe('Undo commit “Add b”')
    await git.undo(dir)
    expect(run('log', '-1', '--format=%s')).toBe('Second')
    expect(run('diff', '--cached', '--name-only')).toBe('b.txt')
  })

  it('undoes an amend back to the original commit', async () => {
    writeFileSync(join(dir, 'a.txt'), 'three\n')
    run('add', 'a.txt')
    await git.commit(dir, 'Second, amended', true)
    await git.undo(dir)
    expect(run('log', '-1', '--format=%s')).toBe('Second')
    expect(run('diff', '--cached', '--name-only')).toBe('a.txt')
  })

  it('undoes a checkout', async () => {
    run('branch', 'feature')
    await git.checkoutBranch(dir, 'feature')
    expect(await git.undoLabel(dir)).toBe('Undo checkout of feature')
    await git.undo(dir)
    expect(run('branch', '--show-current')).toBe('main')
  })

  it('undoes a mixed reset without touching the working tree', async () => {
    await git.resetTo(dir, 'HEAD~1', 'mixed')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('two\n')
    await git.undo(dir)
    expect(run('log', '-1', '--format=%s')).toBe('Second')
    expect(run('status', '--porcelain')).toBe('')
  })

  it('undoes a hard reset', async () => {
    await git.resetTo(dir, 'HEAD~1', 'hard')
    await git.undo(dir)
    expect(run('log', '-1', '--format=%s')).toBe('Second')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('two\n')
  })

  it('refuses to undo a merge over uncommitted changes to the same file', async () => {
    run('checkout', '-q', '-b', 'feature')
    commitFile('a.txt', 'feature\n', 'Feature')
    run('checkout', '-q', 'main')
    run('merge', '-q', 'feature')
    writeFileSync(join(dir, 'a.txt'), 'local edit\n')
    await expect(git.undo(dir)).rejects.toThrow(/uncommitted changes/)
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('local edit\n')
  })

  it('has nothing to undo in a fresh repo', async () => {
    rmSync(dir, { recursive: true, force: true })
    dir = mkdtempSync(join(tmpdir(), 'sillygit-history-'))
    run('init', '-q')
    expect(await git.undoLabel(dir)).toBeNull()
  })
})

describe('stashes', () => {
  it('lists, applies and drops stashes, including untracked files', async () => {
    writeFileSync(join(dir, 'new.txt'), 'new\n')
    await git.stash(dir, 'my work')
    writeFileSync(join(dir, 'a.txt'), 'edit\n')
    await git.stash(dir)
    const list = await git.listStashes(dir)
    expect(list.map((s) => s.ref)).toEqual(['stash@{0}', 'stash@{1}'])
    expect(list[1].message).toBe('On main: my work')
    await git.stashApply(dir, 'stash@{1}')
    expect(readFileSync(join(dir, 'new.txt'), 'utf8')).toBe('new\n')
    await git.stashDrop(dir, 'stash@{1}')
    expect((await git.listStashes(dir)).length).toBe(1)
    // Stash commits stay out of the graph.
    expect((await git.getGraphLog(dir)).map((c) => c.subject)).toEqual(['Second', 'First'])
  })
})

describe('searchCommits', () => {
  it('matches subject, author and hash prefix across all branches', async () => {
    run('checkout', '-q', '-b', 'feature')
    commitFile('c.txt', 'c\n', 'Add login page')
    const hash = run('rev-parse', 'HEAD')
    expect(await git.searchCommits(dir, 'LOGIN')).toEqual([{ hash, index: 0 }])
    expect(await git.searchCommits(dir, hash.slice(0, 7))).toEqual([{ hash, index: 0 }])
    expect((await git.searchCommits(dir, 'first')).map((h) => h.index)).toEqual([2])
    expect((await git.searchCommits(dir, 'lovelace')).length).toBe(3)
    expect(await git.searchCommits(dir, '  ')).toEqual([])
  })
})

describe('commit --amend', () => {
  it('rewrites the last message', async () => {
    await git.commit(dir, 'Second, reworded', true)
    expect(await git.lastCommitMessage(dir)).toBe('Second, reworded')
    expect(run('rev-list', '--count', 'HEAD')).toBe('2')
  })
})
