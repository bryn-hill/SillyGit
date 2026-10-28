import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RebaseAction, RebaseStep } from '../shared/rebase'
import { abortOperation, continueOperation, getOperationState, saveResolution, skipOperation } from './conflicts'
import { planInteractiveRebase, startInteractiveRebase } from './rebase'

let dir: string

const run = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const subjects = (): string[] => run('log', '--format=%s', 'base..HEAD').split('\n').filter(Boolean).reverse()
const commitFile = (file: string, content: string, message: string): string => {
  writeFileSync(join(dir, file), content)
  run('add', '.')
  run('commit', '-q', '-m', message)
  return run('rev-parse', 'HEAD')
}

let base: string
let c: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-rebase-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada')
  run('config', 'user.email', 'ada@example.com')
  base = commitFile('base.txt', 'base\n', 'Base')
  run('tag', 'base')
  c = [
    commitFile('a.txt', 'a\n', 'Add a'),
    commitFile('b.txt', 'b\n', 'Add b\n\nBody of b'),
    commitFile('c.txt', 'c\n', 'Add c'),
    commitFile('d.txt', 'd\n', 'Add d')
  ]
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const steps = (...actions: RebaseAction[]): RebaseStep[] => c.map((hash, i) => ({ hash, action: actions[i] ?? 'pick' }))

async function start(plan: RebaseStep[]): Promise<{ conflicts: boolean }> {
  return startInteractiveRebase(dir, base, run('rev-parse', 'HEAD'), plan)
}

describe('planInteractiveRebase', () => {
  it('lists the commits after the base, oldest first, with full messages', async () => {
    const plan = await planInteractiveRebase(dir, base)
    expect(plan.branch).toBe('main')
    expect(plan.base.subject).toBe('Base')
    expect(plan.commits.map((x) => x.subject)).toEqual(['Add a', 'Add b', 'Add c', 'Add d'])
    expect(plan.commits[1].message).toBe('Add b\n\nBody of b')
    expect(plan.commits[0].author).toBe('Ada')
  })

  it('refuses the branch tip, a detached HEAD, a commit off the branch and merges', async () => {
    await expect(planInteractiveRebase(dir, c[3])).rejects.toThrow(/below the branch tip/)
    run('checkout', '-q', '--detach')
    await expect(planInteractiveRebase(dir, base)).rejects.toThrow(/Check out a branch/)
    run('checkout', '-q', 'main')
    run('checkout', '-q', '-b', 'side', base)
    const side = commitFile('s.txt', 's\n', 'Side')
    run('checkout', '-q', 'main')
    await expect(planInteractiveRebase(dir, side)).rejects.toThrow(/not part of main/)
    run('merge', '-q', '--no-edit', 'side')
    await expect(planInteractiveRebase(dir, base)).rejects.toThrow(/include a merge/)
  })
})

describe('startInteractiveRebase', () => {
  it('reorders and drops commits', async () => {
    const plan = steps('pick', 'drop', 'pick', 'pick')
    expect(await start([plan[3], plan[0], plan[1], plan[2]])).toEqual({ conflicts: false })
    expect(subjects()).toEqual(['Add d', 'Add a', 'Add c'])
    expect(existsSync(join(dir, 'b.txt'))).toBe(false)
    expect(existsSync(join(dir, '.git', 'sillygit-rebase'))).toBe(false)
  })

  it('rewords with the typed message, without opening an editor', async () => {
    const plan = steps('pick', 'reword')
    plan[1].message = 'Add b properly\n\nNew body'
    await start(plan)
    expect(subjects()).toEqual(['Add a', 'Add b properly', 'Add c', 'Add d'])
    expect(run('log', '-1', '--format=%B', 'HEAD~2')).toContain('New body')
  })

  it('squashes with the combined or typed message and fixes up silently', async () => {
    await start(steps('pick', 'squash', 'fixup', 'pick'))
    expect(subjects()).toEqual(['Add a', 'Add d'])
    expect(run('log', '-1', '--format=%B', 'HEAD~1')).toBe('Add a\n\nAdd b\n\nBody of b')
    expect(run('ls-tree', '--name-only', 'HEAD~1').split('\n')).toEqual(['a.txt', 'b.txt', 'base.txt', 'c.txt'])

    run('reset', '-q', '--hard', c[3])
    const typed = steps('pick', 'pick', 'squash', 'fixup')
    typed[1].message = 'B, C and D together'
    await start(typed)
    expect(subjects()).toEqual(['Add a', 'B, C and D together'])
  })

  it('rewords a commit that others are fixed up into', async () => {
    const plan = steps('reword', 'fixup')
    plan[0].message = 'A and b'
    await start(plan)
    expect(subjects()).toEqual(['A and b', 'Add c', 'Add d'])
  })

  it('drops every commit', async () => {
    await start(steps('drop', 'drop', 'drop', 'drop'))
    expect(run('rev-parse', 'HEAD')).toBe(base)
  })

  it('keeps uncommitted changes', async () => {
    writeFileSync(join(dir, 'a.txt'), 'edited\n')
    await start(steps('pick', 'drop'))
    expect(subjects()).toEqual(['Add a', 'Add c', 'Add d'])
    expect(run('status', '--porcelain')).toBe('M a.txt')
  })

  it('refuses a plan that no longer matches the branch, or squashes the oldest commit', async () => {
    const head = run('rev-parse', 'HEAD')
    await expect(startInteractiveRebase(dir, base, head, steps().slice(1))).rejects.toThrow(/no longer matches/)
    await expect(startInteractiveRebase(dir, base, c[2], steps())).rejects.toThrow(/has changed/)
    await expect(start(steps('fixup'))).rejects.toThrow(/oldest commit/)
    expect(run('rev-parse', 'HEAD')).toBe(head)
  })

  describe('conflicts', () => {
    // Two commits that edit the same line, so swapping them conflicts.
    beforeEach(() => {
      run('reset', '-q', '--hard', base)
      c = [
        commitFile('f.txt', 'one\n', 'Create f'),
        commitFile('f.txt', 'two\n', 'Change f to two'),
        commitFile('f.txt', 'three\n', 'Change f to three')
      ]
    })

    it('stops on a conflict, then keeps the typed message after continuing', async () => {
      const plan = steps('pick', 'pick', 'reword')
      plan[2].message = 'Three, reworded'
      expect(await start([plan[0], plan[2], plan[1]])).toEqual({ conflicts: true })
      expect(await getOperationState(dir)).toMatchObject({ kind: 'rebase', rebaseBranch: 'main', step: 2, total: 3 })

      await saveResolution(dir, 'f.txt', 'three\n')
      // Applying "two" on top conflicts as well.
      expect(await continueOperation(dir)).toEqual({ conflicts: true })
      await saveResolution(dir, 'f.txt', 'two and three\n')
      expect(await continueOperation(dir)).toEqual({ conflicts: false })
      expect(subjects()).toEqual(['Create f', 'Three, reworded', 'Change f to two'])
      expect(existsSync(join(dir, '.git', 'sillygit-rebase'))).toBe(false)
    })

    it('keeps the squash message when the squash conflicts', async () => {
      const plan = steps('pick', 'drop', 'squash')
      plan[0].message = 'Create f at three'
      expect(await start(plan)).toEqual({ conflicts: true })
      await saveResolution(dir, 'f.txt', 'three\n')
      expect(await continueOperation(dir)).toEqual({ conflicts: false })
      expect(subjects()).toEqual(['Create f at three'])
    })

    it('skips the commit that conflicts', async () => {
      expect(await start(steps('pick', 'drop'))).toEqual({ conflicts: true })
      expect(await skipOperation(dir)).toEqual({ conflicts: false })
      expect(subjects()).toEqual(['Create f'])
    })

    it('aborts back to where the branch was', async () => {
      const head = run('rev-parse', 'HEAD')
      await start(steps('pick', 'drop'))
      await abortOperation(dir)
      expect(run('rev-parse', 'HEAD')).toBe(head)
      expect(await getOperationState(dir)).toBeNull()
      expect(existsSync(join(dir, '.git', 'sillygit-rebase'))).toBe(false)
    })
  })
})
