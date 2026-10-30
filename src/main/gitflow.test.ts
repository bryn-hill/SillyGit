import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultGitFlowConfig } from '../shared/gitflow'
import { finishGitFlowBranch, getGitFlowConfig, initGitFlow, startGitFlowBranch } from './gitflow'

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function commitFile(name: string, content: string, message: string): void {
  writeFileSync(join(dir, name), content)
  run('add', name)
  run('commit', '-q', '-m', message)
}

const subjects = (ref: string): string[] => run('log', '--topo-order', '--format=%s', ref).split('\n')
const head = (): string => run('symbolic-ref', '--short', 'HEAD')
const branchList = (): string[] => run('for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n')

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-gitflow-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  commitFile('base.txt', 'base\n', 'First')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const init = (): Promise<{ createdDevelop: boolean }> => initGitFlow(dir, defaultGitFlowConfig(['main']))

describe('git-flow', () => {
  it('stores git-flow-compatible config and creates develop from main without switching', async () => {
    expect(await getGitFlowConfig(dir)).toBeNull()
    expect(await init()).toEqual({ createdDevelop: true })
    expect(run('config', 'gitflow.branch.master')).toBe('main')
    expect(run('config', 'gitflow.branch.develop')).toBe('develop')
    expect(run('config', 'gitflow.prefix.feature')).toBe('feature/')
    expect(run('config', 'gitflow.prefix.versiontag')).toBe('')
    expect(run('rev-parse', 'develop')).toBe(run('rev-parse', 'main'))
    expect(head()).toBe('main')
    expect((await getGitFlowConfig(dir))?.develop).toBe('develop')
    // Running it again keeps the existing develop.
    expect(await init()).toEqual({ createdDevelop: false })
  })

  it('refuses a production branch that does not exist', async () => {
    await expect(initGitFlow(dir, { ...defaultGitFlowConfig([]), master: 'trunk' })).rejects.toThrow('no local branch called trunk')
  })

  it('needs setting up before starting anything', async () => {
    await expect(startGitFlowBranch(dir, 'feature', 'x')).rejects.toThrow('Set up git-flow')
  })

  it('finishes a feature with a merge commit into develop and deletes it', async () => {
    await init()
    expect(await startGitFlowBranch(dir, 'feature', 'login')).toBe('feature/login')
    expect(head()).toBe('feature/login')
    expect(run('merge-base', 'HEAD', 'develop')).toBe(run('rev-parse', 'develop'))
    commitFile('login.txt', 'login\n', 'Add login')

    expect(await finishGitFlowBranch(dir, 'feature/login')).toEqual({
      mergedInto: ['develop'],
      tag: null,
      conflictsIn: null,
      deleted: true
    })
    expect(head()).toBe('develop')
    expect(subjects('develop')).toEqual(["Merge branch 'feature/login' into develop", 'Add login', 'First'])
    expect(branchList()).not.toContain('feature/login')
    expect(subjects('main')).toEqual(['First'])
  })

  it('finishes a release into main (tagged) and develop', async () => {
    await initGitFlow(dir, { ...defaultGitFlowConfig(['main']), versionTag: 'v' })
    await startGitFlowBranch(dir, 'release', '1.0.0')
    commitFile('version.txt', '1.0.0\n', 'Bump version')
    await expect(startGitFlowBranch(dir, 'release', '1.1.0')).rejects.toThrow('release/1.0.0 is still open')

    const result = await finishGitFlowBranch(dir, 'release/1.0.0', 'Release 1.0.0')

    expect(result).toEqual({ mergedInto: ['main', 'develop'], tag: 'v1.0.0', conflictsIn: null, deleted: true })
    expect(subjects('main')[0]).toBe("Merge branch 'release/1.0.0'")
    expect(subjects('develop')[0]).toBe("Merge branch 'release/1.0.0' into develop")
    expect(run('rev-parse', 'v1.0.0^{commit}')).toBe(run('rev-parse', 'main'))
    expect(run('tag', '-l', '--format=%(contents:subject)', 'v1.0.0')).toBe('Release 1.0.0')
    expect(head()).toBe('develop')
  })

  it('finishes a hotfix from main into main and the open release instead of develop', async () => {
    await init()
    await startGitFlowBranch(dir, 'release', '2.0')
    await startGitFlowBranch(dir, 'hotfix', '1.0.1')
    expect(run('merge-base', 'HEAD', 'main')).toBe(run('rev-parse', 'main'))
    commitFile('fix.txt', 'fix\n', 'Fix crash')

    const result = await finishGitFlowBranch(dir, 'hotfix/1.0.1')

    expect(result).toEqual({ mergedInto: ['main', 'release/2.0'], tag: '1.0.1', conflictsIn: null, deleted: true })
    expect(subjects('release/2.0')).toContain('Fix crash')
    expect(subjects('develop')).not.toContain('Fix crash')
    expect(head()).toBe('release/2.0')
  })

  it('stops on a conflict and carries on from there when finished again', async () => {
    await init()
    await startGitFlowBranch(dir, 'release', '1.0')
    commitFile('base.txt', 'release\n', 'Release edit')
    run('checkout', '-q', 'develop')
    commitFile('base.txt', 'develop\n', 'Develop edit')

    const first = await finishGitFlowBranch(dir, 'release/1.0')
    expect(first).toEqual({ mergedInto: ['main'], tag: null, conflictsIn: 'develop', deleted: false })
    expect(run('tag', '-l')).toBe('1.0')
    expect(head()).toBe('develop')

    writeFileSync(join(dir, 'base.txt'), 'both\n')
    run('add', 'base.txt')
    execFileSync('git', ['commit', '-q', '--no-edit'], { cwd: dir, env: { ...process.env, GIT_EDITOR: 'true' } })

    const second = await finishGitFlowBranch(dir, 'release/1.0')
    expect(second).toEqual({ mergedInto: ['main', 'develop'], tag: '1.0', conflictsIn: null, deleted: true })
    expect(branchList()).not.toContain('release/1.0')
  })

  it('refuses uncommitted changes, non-flow branches and a clashing tag', async () => {
    await init()
    await expect(finishGitFlowBranch(dir, 'develop')).rejects.toThrow("isn't a git-flow")
    await startGitFlowBranch(dir, 'release', '1.0')
    commitFile('r.txt', 'r\n', 'Release work')
    writeFileSync(join(dir, 'base.txt'), 'dirty\n')
    await expect(finishGitFlowBranch(dir, 'release/1.0')).rejects.toThrow('Commit or stash')
    run('checkout', '--', 'base.txt')
    run('tag', '1.0', 'main')
    await expect(finishGitFlowBranch(dir, 'release/1.0')).rejects.toThrow('tag called 1.0 already exists')
  })
})
