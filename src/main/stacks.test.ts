import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteBranch, renameBranch } from './branches'
import { createStackedBranch, listStacks, pushStack, restack, setStackParent, stackParents } from './stacks'

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

const subjects = (ref: string): string[] => run('log', '--format=%s', ref).split('\n')

/** main <- one <- two, each with a commit of its own. */
async function buildStack(): Promise<void> {
  await createStackedBranch(dir, 'main', 'one')
  commitFile('one.txt', 'one\n', 'One')
  await createStackedBranch(dir, 'one', 'two')
  commitFile('two.txt', 'two\n', 'Two')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-stacks-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  commitFile('base.txt', 'base\n', 'First')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('stacks', () => {
  it('lists a stack bottom first, with what needs restacking', async () => {
    await buildStack()
    expect(await listStacks(dir)).toEqual([
      {
        id: 'one',
        trunk: 'main',
        branches: [
          { name: 'one', parent: 'main', depth: 0, needsRestack: false, parentMissing: false, ahead: 1 },
          { name: 'two', parent: 'one', depth: 1, needsRestack: false, parentMissing: false, ahead: 1 }
        ]
      }
    ])
    run('checkout', '-q', 'one')
    commitFile('one.txt', 'one more\n', 'One more')
    const [stack] = await listStacks(dir)
    expect(stack.branches.map((b) => b.needsRestack)).toEqual([false, true])
  })

  it('restacks every branch onto its parent and goes back, keeping uncommitted work', async () => {
    await buildStack()
    run('checkout', '-q', 'main')
    commitFile('main.txt', 'main\n', 'Main moved')
    run('checkout', '-q', 'one')
    commitFile('one.txt', 'one more\n', 'One more')
    writeFileSync(join(dir, 'base.txt'), 'edited\n')

    const result = await restack(dir, 'two')

    expect(result).toEqual({ restacked: ['one', 'two'], conflicts: false, stoppedAt: null, stashed: false })
    expect(subjects('two')).toEqual(['Two', 'One more', 'One', 'Main moved', 'First'])
    expect(run('symbolic-ref', '--short', 'HEAD')).toBe('one')
    expect(readFileSync(join(dir, 'base.txt'), 'utf8')).toBe('edited\n')
    expect((await listStacks(dir))[0].branches.every((b) => !b.needsRestack)).toBe(true)
  })

  it('stops on a conflict, and restacking again carries on from there', async () => {
    await buildStack()
    run('checkout', '-q', 'one')
    commitFile('two.txt', 'clash\n', 'One adds two.txt')

    const result = await restack(dir, 'one')
    expect(result).toMatchObject({ restacked: [], conflicts: true, stoppedAt: 'two' })

    writeFileSync(join(dir, 'two.txt'), 'resolved\n')
    run('add', 'two.txt')
    execFileSync('git', ['rebase', '--continue'], { cwd: dir, env: { ...process.env, GIT_EDITOR: 'true' } })
    expect((await restack(dir, 'one')).conflicts).toBe(false)
    expect(subjects('two')).toEqual(['Two', 'One adds two.txt', 'One', 'First'])
  })

  it('moves children down when a parent is squash-merged and deleted, replaying only their own commits', async () => {
    await buildStack()
    run('checkout', '-q', 'main')
    run('merge', '-q', '--squash', 'one')
    run('commit', '-q', '-m', 'One (squashed)')

    await deleteBranch(dir, 'one', true)
    expect(await stackParents(dir)).toEqual({ two: 'main' })

    await restack(dir, 'two')
    expect(subjects('two')).toEqual(['Two', 'One (squashed)', 'First'])
  })

  it('follows a renamed parent and refuses loops', async () => {
    await buildStack()
    await renameBranch(dir, 'one', 'uno')
    expect(await stackParents(dir)).toEqual({ uno: 'main', two: 'uno' })
    await expect(setStackParent(dir, 'uno', 'two')).rejects.toThrow('two is already stacked on uno')
    await setStackParent(dir, 'two', null)
    expect(await stackParents(dir)).toEqual({ uno: 'main' })
  })

  it('pushes the whole stack with tracking', async () => {
    await buildStack()
    const remote = mkdtempSync(join(tmpdir(), 'sillygit-stacks-remote-'))
    try {
      execFileSync('git', ['init', '-q', '--bare', remote])
      run('remote', 'add', 'origin', remote)
      expect(await pushStack(dir, 'one')).toEqual({ remote: 'origin', pushed: ['one', 'two'] })
      expect(run('rev-parse', '--abbrev-ref', 'two@{upstream}')).toBe('origin/two')
    } finally {
      rmSync(remote, { recursive: true, force: true })
    }
  })
})
