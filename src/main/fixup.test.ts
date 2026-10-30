import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { absorb, fixupInto, planAbsorb } from './fixup'

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function commitFile(name: string, content: string, message: string): string {
  writeFileSync(join(dir, name), content)
  run('add', name)
  run('commit', '-q', '-m', message)
  return run('rev-parse', 'HEAD')
}

const subjects = (): string[] => run('log', '--format=%s').split('\n')

let first: string
let addA: string
let addB: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-fixup-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  first = commitFile('base.txt', 'base\n', 'First')
  addA = commitFile('a.txt', 'a1\na2\na3\n', 'Add a')
  addB = commitFile('b.txt', 'b1\nb2\nb3\n', 'Add b')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('fixupInto', () => {
  it('folds the staged change into an older commit and keeps unstaged work', async () => {
    writeFileSync(join(dir, 'a.txt'), 'a1\nA2\na3\n')
    run('add', 'a.txt')
    writeFileSync(join(dir, 'b.txt'), 'b1\nb2\nb3\nmore\n')

    const result = await fixupInto(dir, addA)

    expect(result).toEqual({ conflicts: false, pushed: false })
    expect(subjects()).toEqual(['Add b', 'Add a', 'First'])
    expect(run('show', 'HEAD~1:a.txt')).toBe('a1\nA2\na3')
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('b1\nb2\nb3\nmore\n')
  })

  it('works on the root commit', async () => {
    writeFileSync(join(dir, 'base.txt'), 'BASE\n')
    run('add', 'base.txt')
    await fixupInto(dir, first)
    expect(subjects()).toEqual(['Add b', 'Add a', 'First'])
    expect(run('show', 'HEAD~2:base.txt')).toBe('BASE')
  })

  it('needs something staged', async () => {
    await expect(fixupInto(dir, addA)).rejects.toThrow(/Stage the changes/)
  })

  it('stops on conflicts for the conflict panel', async () => {
    // Change a line that a later commit changes again.
    commitFile('a.txt', 'a1\nlater\na3\n', 'Change a')
    writeFileSync(join(dir, 'a.txt'), 'a1\nlater fixed\na3\n')
    run('add', 'a.txt')
    const result = await fixupInto(dir, addA)
    expect(result.conflicts).toBe(true)
    run('rebase', '--abort')
  })
})

describe('absorb', () => {
  it('sends each staged hunk to the commit that last touched its lines', async () => {
    writeFileSync(join(dir, 'a.txt'), 'a1\nA2\na3\n')
    writeFileSync(join(dir, 'b.txt'), 'b1\nb2\nB3\n')
    writeFileSync(join(dir, 'new.txt'), 'new\n')
    run('add', '.')

    const plan = await planAbsorb(dir)
    const byFile = Object.fromEntries(plan.hunks.map((h) => [h.file, h]))
    expect(byFile['a.txt'].target).toBe(addA)
    expect(byFile['b.txt'].target).toBe(addB)
    expect(byFile['new.txt']).toMatchObject({ target: null, reason: 'New file' })

    const assignments = Object.fromEntries(plan.hunks.flatMap((h) => (h.target ? [[h.unitId, h.target]] : [])))
    const result = await absorb(dir, plan.head, plan.diffText, assignments)

    expect(result.conflicts).toBe(false)
    expect(subjects()).toEqual(['Add b', 'Add a', 'First'])
    expect(run('show', 'HEAD~1:a.txt')).toBe('a1\nA2\na3')
    expect(run('show', 'HEAD:b.txt')).toBe('b1\nb2\nB3')
    // The change with no commit to go into is still there, uncommitted.
    expect(readFileSync(join(dir, 'new.txt'), 'utf8')).toBe('new\n')
    expect(run('status', '--porcelain')).toContain('new.txt')
  })

  it('places an insertion by the lines around it', async () => {
    writeFileSync(join(dir, 'a.txt'), 'a1\na2\ninserted\na3\n')
    run('add', 'a.txt')
    const plan = await planAbsorb(dir)
    expect(plan.hunks[0].target).toBe(addA)
  })

  it('leaves alone lines from pushed commits', async () => {
    run('update-ref', 'refs/remotes/origin/main', addA)
    writeFileSync(join(dir, 'a.txt'), 'a1\nA2\na3\n')
    run('add', 'a.txt')
    const plan = await planAbsorb(dir)
    expect(plan.candidates.map((c) => c.hash)).toEqual([addB])
    expect(plan.hunks[0]).toMatchObject({ target: null, reason: 'Last changed in a pushed commit' })
  })

  it('refuses when the staged changes moved since the plan', async () => {
    writeFileSync(join(dir, 'a.txt'), 'a1\nA2\na3\n')
    run('add', 'a.txt')
    const plan = await planAbsorb(dir)
    writeFileSync(join(dir, 'a.txt'), 'a1\nA2\nA3\n')
    run('add', 'a.txt')
    await expect(absorb(dir, plan.head, plan.diffText, { [plan.hunks[0].unitId]: addA })).rejects.toThrow(/moved/)
    expect(subjects()).toEqual(['Add b', 'Add a', 'First'])
  })
})
