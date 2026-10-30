import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getOperationState } from './conflicts'
import { moveCommit, rewordCommit, squashCommits, uncommitChange } from './editCommit'

let dir: string

const run = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const subjects = (): string[] => run('log', '--format=%s').split('\n').filter(Boolean).reverse()
const commitFile = (file: string, content: string, message: string): string => {
  writeFileSync(join(dir, file), content)
  run('add', '.')
  run('commit', '-q', '-m', message)
  return run('rev-parse', 'HEAD')
}
const read = (file: string): string => readFileSync(join(dir, file), 'utf8')

let c: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-edit-commit-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada')
  run('config', 'user.email', 'ada@example.com')
  c = [
    commitFile('base.txt', 'base\n', 'Base'),
    commitFile('a.txt', 'a\n', 'Add a'),
    commitFile('b.txt', 'b\n', 'Add b\n\nBody of b'),
    commitFile('c.txt', 'c\n', 'Add c')
  ]
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('rewordCommit', () => {
  it('rewords an older commit and keeps the ones after it', async () => {
    const res = await rewordCommit(dir, c[1], 'Add the letter a\n\nWith a body')
    expect(res).toEqual({ conflicts: false, pushed: false })
    expect(subjects()).toEqual(['Base', 'Add the letter a', 'Add b', 'Add c'])
    expect(run('log', '-1', '--format=%B', 'HEAD~2')).toBe('Add the letter a\n\nWith a body')
    expect(run('rev-parse', 'HEAD~3')).toBe(c[0])
  })

  it('rewords the root commit and the tip', async () => {
    await rewordCommit(dir, c[0], 'First')
    await rewordCommit(dir, 'HEAD', 'Last')
    expect(subjects()).toEqual(['First', 'Add a', 'Add b', 'Last'])
  })

  it('keeps uncommitted changes', async () => {
    writeFileSync(join(dir, 'a.txt'), 'a changed\n')
    await rewordCommit(dir, c[1], 'Reworded')
    expect(read('a.txt')).toBe('a changed\n')
    expect(run('status', '--porcelain')).toBe('M a.txt')
  })

  it('refuses an empty or unchanged message and a commit off the branch', async () => {
    await expect(rewordCommit(dir, c[1], '  ')).rejects.toThrow(/can’t be empty/)
    await expect(rewordCommit(dir, c[1], 'Add a')).rejects.toThrow(/already has/)
    run('checkout', '-q', '-b', 'side', c[1])
    const side = commitFile('s.txt', 's\n', 'Side')
    run('checkout', '-q', 'main')
    await expect(rewordCommit(dir, side, 'x')).rejects.toThrow(/not part of main/)
  })

  it('refuses when a merge is in the way, and on a detached HEAD', async () => {
    run('checkout', '-q', '-b', 'side', c[1])
    commitFile('s.txt', 's\n', 'Side')
    run('checkout', '-q', 'main')
    run('merge', '-q', '--no-ff', '-m', 'Merge side', 'side')
    await expect(rewordCommit(dir, c[2], 'x')).rejects.toThrow(/merge in the way/)
    run('checkout', '-q', '--detach')
    await expect(rewordCommit(dir, c[2], 'x')).rejects.toThrow(/Check out a branch/)
  })
})

describe('moveCommit', () => {
  it('moves a commit up and down', async () => {
    await moveCommit(dir, c[1], 'up')
    expect(subjects()).toEqual(['Base', 'Add b', 'Add a', 'Add c'])
    await moveCommit(dir, 'HEAD', 'down')
    expect(subjects()).toEqual(['Base', 'Add b', 'Add c', 'Add a'])
  })

  it('moves a commit below the root commit', async () => {
    await moveCommit(dir, c[1], 'down')
    expect(subjects()).toEqual(['Add a', 'Base', 'Add b', 'Add c'])
  })

  it('refuses to move the tip up or the root down', async () => {
    await expect(moveCommit(dir, 'HEAD', 'up')).rejects.toThrow(/already the newest/)
    await expect(moveCommit(dir, c[0], 'down')).rejects.toThrow(/already the oldest/)
  })

  it('stops on a conflict like any rebase', async () => {
    commitFile('a.txt', 'a two\n', 'Change a')
    const e = commitFile('a.txt', 'a three\n', 'Change a again')
    expect((await moveCommit(dir, e, 'down')).conflicts).toBe(true)
    expect((await getOperationState(dir))?.kind).toBe('rebase')
  })
})

describe('squashCommits', () => {
  it('squashes a newer commit into an older one, keeping both messages', async () => {
    await squashCommits(dir, [c[3]], c[1], 'squash')
    expect(subjects()).toEqual(['Base', 'Add a', 'Add b'])
    expect(run('log', '-1', '--format=%B', 'HEAD~1')).toBe('Add a\n\nAdd c')
    expect(run('show', '--format=', '--name-only', 'HEAD~1').split('\n')).toEqual(['a.txt', 'c.txt'])
  })

  it('fixes up an older commit into a newer one, keeping only its message', async () => {
    await squashCommits(dir, [c[1]], c[3], 'fixup')
    expect(subjects()).toEqual(['Base', 'Add b', 'Add c'])
    expect(run('show', '--format=', '--name-only', 'HEAD').split('\n')).toEqual(['a.txt', 'c.txt'])
  })

  it('squashes several commits at once', async () => {
    await squashCommits(dir, [c[2], c[3]], c[1], 'fixup')
    expect(subjects()).toEqual(['Base', 'Add a'])
    expect(read('c.txt')).toBe('c\n')
  })

  it('refuses a commit into itself', async () => {
    await expect(squashCommits(dir, [c[1]], c[1], 'squash')).rejects.toThrow(/into itself/)
  })
})

describe('uncommitChange', () => {
  beforeEach(() => {
    writeFileSync(join(dir, 'big.txt'), Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n')
    run('add', '.')
    run('commit', '-q', '-m', 'Add big')
    const lines = read('big.txt').split('\n')
    lines[1] = 'line 2 changed'
    lines[17] = 'line 18 changed'
    writeFileSync(join(dir, 'big.txt'), lines.join('\n'))
    writeFileSync(join(dir, 'b.txt'), 'b two\n')
    run('add', '.')
    run('commit', '-q', '-m', 'Change big and b')
    commitFile('d.txt', 'd\n', 'Add d')
  })

  it('takes a whole file out of an older commit into the working tree', async () => {
    const res = await uncommitChange(dir, 'HEAD~1', 'b.txt', null, null)
    expect(res).toEqual({ conflicts: false, pushed: false })
    expect(subjects().slice(-2)).toEqual(['Change big and b', 'Add d'])
    expect(run('show', '--format=', '--name-only', 'HEAD~1')).toBe('big.txt')
    expect(read('b.txt')).toBe('b two\n')
    expect(run('status', '--porcelain')).toBe('M b.txt')
  })

  it('takes one hunk out and leaves the other in the commit', async () => {
    await uncommitChange(dir, 'HEAD~1', 'big.txt', null, 'f0h1')
    const diff = run('show', '--format=', 'HEAD~1', '--', 'big.txt')
    expect(diff).toContain('+line 2 changed')
    expect(diff).not.toContain('line 18 changed')
    expect(read('big.txt')).toContain('line 18 changed')
    expect(run('diff', '--', 'big.txt')).toContain('+line 18 changed')
  })

  it('drops a commit whose whole change is taken out, bringing back an added file', async () => {
    await uncommitChange(dir, c[1], 'a.txt', null, null)
    expect(subjects()).toEqual(['Base', 'Add b', 'Add c', 'Add big', 'Change big and b', 'Add d'])
    expect(read('a.txt')).toBe('a\n')
    // The autostash brings a new file back as added.
    expect(run('status', '--porcelain')).toBe('A  a.txt')
  })

  it('keeps other uncommitted work', async () => {
    writeFileSync(join(dir, 'd.txt'), 'd edited\n')
    await uncommitChange(dir, 'HEAD~1', 'b.txt', null, null)
    expect(read('d.txt')).toBe('d edited\n')
    expect(read('b.txt')).toBe('b two\n')
  })

  it('refuses when a later commit changed the same lines, leaving everything as it was', async () => {
    const head = commitFile('b.txt', 'b three\n', 'Change b again')
    await expect(uncommitChange(dir, 'HEAD~2', 'b.txt', null, null)).rejects.toThrow(/later commit changed the same lines/)
    expect(run('rev-parse', 'HEAD')).toBe(head)
    expect(run('status', '--porcelain')).toBe('')
  })
})
