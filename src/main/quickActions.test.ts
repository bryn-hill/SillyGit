import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JiraSite } from '../shared/jira'

const jira = vi.hoisted(() => ({ sites: [] as JiraSite[] }))
vi.mock('./jira', () => ({ jiraSites: async () => jira.sites }))

import { bumpPackageVersion, getPackageVersion, pullRequestText, suggestForStaged } from './quickActions'

let dir: string

const run = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const read = (name: string): string => readFileSync(join(dir, name), 'utf8')
const write = (name: string, text: string): void => writeFileSync(join(dir, name), text)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-quick-'))
  jira.sites = []
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const PKG = `{
    "name": "demo",
    "version": "1.4.2",
    "dependencies": {
        "left-pad": "1.4.2"
    }
}
`

const LOCK = `{
  "name": "demo",
  "version": "1.4.2",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "demo",
      "version": "1.4.2"
    },
    "node_modules/left-pad": {
      "version": "1.4.2"
    }
  }
}
`

describe('getPackageVersion', () => {
  it('reads the root version, or null when there is none to read', async () => {
    expect(await getPackageVersion(dir)).toBeNull()
    write('package.json', PKG)
    expect(await getPackageVersion(dir)).toBe('1.4.2')
    write('package.json', '{ broken')
    expect(await getPackageVersion(dir)).toBeNull()
    write('package.json', '{ "version": 3 }')
    expect(await getPackageVersion(dir)).toBeNull()
  })
})

describe('bumpPackageVersion', () => {
  it('bumps package.json and the lockfile root, keeping formatting and dependencies alone', async () => {
    write('package.json', PKG)
    write('package-lock.json', LOCK)
    const bump = await bumpPackageVersion(dir, 'minor')
    expect(bump).toEqual({
      files: ['package.json', 'package-lock.json'],
      version: '1.5.0',
      message: 'chore: bump version to 1.5.0'
    })
    expect(read('package.json')).toBe(PKG.replace('"version": "1.4.2"', '"version": "1.5.0"'))
    const lock = JSON.parse(read('package-lock.json'))
    expect(lock.version).toBe('1.5.0')
    expect(lock.packages[''].version).toBe('1.5.0')
    expect(lock.packages['node_modules/left-pad'].version).toBe('1.4.2')
  })

  it('works without a lockfile', async () => {
    write('package.json', PKG)
    expect((await bumpPackageVersion(dir, 'major')).files).toEqual(['package.json'])
    expect(JSON.parse(read('package.json')).version).toBe('2.0.0')
  })

  it("leaves a lockfile alone when its version doesn't match", async () => {
    write('package.json', PKG)
    write('package-lock.json', LOCK.replaceAll('1.4.2', '0.9.0'))
    expect((await bumpPackageVersion(dir, 'patch')).files).toEqual(['package.json'])
    expect(read('package-lock.json')).toBe(LOCK.replaceAll('1.4.2', '0.9.0'))
  })

  it('refuses a missing or unbumpable version', async () => {
    await expect(bumpPackageVersion(dir, 'patch')).rejects.toThrow(/No version found/)
    write('package.json', '{ "version": "next" }')
    await expect(bumpPackageVersion(dir, 'patch')).rejects.toThrow(/not a version SillyGit can bump/)
    expect(read('package.json')).toBe('{ "version": "next" }')
  })
})

describe('with a repo', () => {
  beforeEach(() => {
    run('init', '-q', '-b', 'main')
    run('config', 'user.name', 'Ada')
    run('config', 'user.email', 'ada@example.com')
    write('README.md', 'hi\n')
    run('add', '.')
    run('commit', '-q', '-m', 'Initial')
  })

  it('suggests messages from what is staged, ignoring unstaged changes', async () => {
    write('package.json', PKG)
    run('add', 'package.json')
    run('commit', '-q', '-m', 'Add package.json')
    expect(await suggestForStaged(dir)).toEqual([])

    await bumpPackageVersion(dir, 'patch')
    write('README.md', 'unstaged edit\n')
    run('add', 'package.json')
    expect((await suggestForStaged(dir)).map((s) => s.message)).toEqual([
      'chore: bump version to 1.4.3',
      'chore(release): v1.4.3'
    ])
  })

  it('builds pull request text from the commits on the branch, bodies included', async () => {
    run('checkout', '-q', '-b', 'claude/fix-safari-export')
    run('commit', '-q', '--allow-empty', '-m', 'fix: only commit', '-m', 'Explains\n\nthe fix')
    expect(await pullRequestText(dir, 'main', 'HEAD', 'claude/fix-safari-export')).toEqual({
      title: 'fix: only commit',
      body: 'Explains\n\nthe fix'
    })

    run('commit', '-q', '--allow-empty', '-m', 'test: cover it')
    const text = await pullRequestText(dir, 'main', 'HEAD', 'claude/fix-safari-export')
    expect(text.title).toBe('Fix safari export')
    const hashes = run('log', '--format=%h', '-2', '--abbrev=7').split('\n')
    expect(text.body).toBe(`## Commits\n\n- fix: only commit (${hashes[1]})\n- test: cover it (${hashes[0]})`)
  })

  it('closes the issue the branch was started from', async () => {
    run('checkout', '-q', '-b', '42-fix-export')
    run('config', 'branch.42-fix-export.sillygit-issue', '42')
    run('commit', '-q', '--allow-empty', '-m', 'fix: export on safari')
    expect(await pullRequestText(dir, 'main', 'HEAD', '42-fix-export')).toEqual({
      title: 'fix: export on safari',
      body: 'Closes #42'
    })
    run('commit', '-q', '--allow-empty', '--amend', '-m', 'fix: export on safari', '-m', 'Fixes #42')
    expect((await pullRequestText(dir, 'main', 'HEAD', '42-fix-export')).body).toBe('Fixes #42')
  })

  it('names the Jira issue the branch was started from in the title and links it', async () => {
    jira.sites = [{ host: 'acme.atlassian.net', projectKeys: ['PROJ'] }]
    run('checkout', '-q', '-b', 'PROJ-7-login')
    run('config', 'branch.PROJ-7-login.sillygit-jira-issue', 'PROJ-7')
    run('commit', '-q', '--allow-empty', '-m', 'feat: log in')
    expect(await pullRequestText(dir, 'main', 'HEAD', 'PROJ-7-login')).toEqual({
      title: 'PROJ-7: feat: log in',
      body: 'Jira: [PROJ-7](https://acme.atlassian.net/browse/PROJ-7)'
    })
  })

  it('finds a known Jira key in a branch name, but not an unknown one', async () => {
    jira.sites = [{ host: 'jira.example.com', projectKeys: ['WEB'] }]
    run('checkout', '-q', '-b', 'feature/web-31-header')
    run('commit', '-q', '--allow-empty', '-m', 'fix: WEB-31 header overlap')
    expect(await pullRequestText(dir, 'main', 'HEAD', 'feature/web-31-header')).toEqual({
      title: 'fix: WEB-31 header overlap',
      body: 'Jira: [WEB-31](https://jira.example.com/browse/WEB-31)'
    })
    run('checkout', '-q', '-b', 'utf-8-fix')
    expect((await pullRequestText(dir, 'main', 'HEAD', 'utf-8-fix')).body).not.toContain('Jira')
  })

  it("doesn't take a number at the start of a branch name for an issue", async () => {
    run('checkout', '-q', '-b', '2026-release')
    run('commit', '-q', '--allow-empty', '-m', 'chore: release')
    expect((await pullRequestText(dir, 'main', 'HEAD', '2026-release')).body).toBe('')
  })
})
