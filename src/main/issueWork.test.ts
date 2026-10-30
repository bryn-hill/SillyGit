import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { issueForBranch, issueWorkOptions, jiraIssueForBranch, startIssueWork } from './issueWork'

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

const head = (): string => run('symbolic-ref', '--short', 'HEAD')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-issues-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  commitFile('base.txt', 'base\n', 'First')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('startIssueWork', () => {
  it('remembers a Jira key apart from GitHub issue numbers', async () => {
    expect(await startIssueWork(dir, 'PROJ-7', 'PROJ-7-login', false)).toEqual({
      branch: 'PROJ-7-login',
      created: true,
      stackedOn: null
    })
    expect(head()).toBe('PROJ-7-login')
    expect(await jiraIssueForBranch(dir, 'PROJ-7-login')).toBe('PROJ-7')
    expect(await issueForBranch(dir, 'PROJ-7-login')).toBeNull()
    expect(await jiraIssueForBranch(dir, 'main')).toBeNull()
  })

  it('branches off main, not the branch checked out, and remembers the issue', async () => {
    const mainTip = run('rev-parse', 'main')
    run('checkout', '-q', '-b', 'other')
    commitFile('other.txt', 'other\n', 'Other work')

    expect(await startIssueWork(dir, 12, '12-fix-export', false)).toEqual({
      branch: '12-fix-export',
      created: true,
      stackedOn: null
    })
    expect(head()).toBe('12-fix-export')
    expect(run('rev-parse', 'HEAD')).toBe(mainTip)
    expect(await issueForBranch(dir, '12-fix-export')).toBe(12)
    expect(run('config', '--get-regexp', '^branch\\.12-fix-export\\.')).not.toMatch(/merge|sillygit-parent/)
  })

  it("prefers origin's default branch, without tracking it", async () => {
    commitFile('local.txt', 'local\n', 'Not pushed yet')
    run('update-ref', 'refs/remotes/origin/main', 'HEAD~1')
    run('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')

    expect((await issueWorkOptions(dir, '3-x')).base).toBe('origin/main')
    await startIssueWork(dir, 3, '3-x', false)
    expect(run('rev-parse', 'HEAD')).toBe(run('rev-parse', 'origin/main'))
    expect(() => run('config', '--get', 'branch.3-x.merge')).toThrow()
  }, 10_000)

  it('stacks on the current branch when asked', async () => {
    run('checkout', '-q', '-b', 'feature')
    const featureTip = commitFile('f.txt', 'f\n', 'Feature')
    const result = await startIssueWork(dir, 8, '8-follow-up', true)
    expect(result).toEqual({ branch: '8-follow-up', created: true, stackedOn: 'feature' })
    expect(run('rev-parse', 'HEAD')).toBe(featureTip)
    expect(run('config', 'branch.8-follow-up.sillygit-parent')).toBe('feature')
  })

  it('checks out a branch that already exists instead of failing', async () => {
    run('branch', '5-again')
    expect(await startIssueWork(dir, 5, '5-again', true)).toEqual({ branch: '5-again', created: false, stackedOn: null })
    expect(head()).toBe('5-again')
    expect(await issueForBranch(dir, '5-again')).toBe(5)
  })

  it('refuses a name git would refuse', async () => {
    await expect(startIssueWork(dir, 1, 'bad..name', false)).rejects.toThrow(/isn't a valid branch name/)
    await expect(startIssueWork(dir, 1, '  ', false)).rejects.toThrow(/Give the branch a name/)
    expect(head()).toBe('main')
  })
})

describe('issueWorkOptions', () => {
  it("only offers stacking on a branch that isn't the trunk", async () => {
    expect(await issueWorkOptions(dir, '4-x')).toEqual({ currentBranch: 'main', base: 'main', canStack: false, branchExists: false })
    run('checkout', '-q', '-b', 'feature')
    expect(await issueWorkOptions(dir, '4-x')).toMatchObject({ currentBranch: 'feature', canStack: true })
    run('branch', '4-x')
    expect(await issueWorkOptions(dir, '4-x')).toMatchObject({ branchExists: true })
  })

  it('knows no issue for a branch Start work didn\'t make', async () => {
    run('branch', '77-something')
    expect(await issueForBranch(dir, '77-something')).toBeNull()
  })
})
