import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runCommands = vi.hoisted(() => new Map<string, string>())
vi.mock('./settings', () => ({
  getRunCommand: async (repoPath: string) => runCommands.get(repoPath) ?? null
}))

import { planRun, runCheckoutPath, suggestCommand } from './run'

let root: string
let dir: string
let runRoot: string

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const commit = (file: string, content: string, message: string): string => {
  writeFileSync(join(dir, file), content)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sillygit-run-'))
  dir = join(root, 'work')
  runRoot = join(root, 'userData', 'run-checkouts')
  execFileSync('git', ['init', '-q', '-b', 'main', dir])
  git(dir, 'config', 'user.name', 'Ada')
  git(dir, 'config', 'user.email', 'ada@example.com')
  runCommands.clear()
  runCommands.set(dir, 'npm run dev')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('planRun', () => {
  it('runs the working tree in the repo itself', async () => {
    commit('a.txt', 'a\n', 'First')
    expect(await planRun(dir, null, runRoot)).toEqual({ cwd: dir, script: 'npm run dev', command: 'npm run dev', commit: null })
  })

  it('needs a run command', async () => {
    commit('a.txt', 'a\n', 'First')
    runCommands.clear()
    await expect(planRun(dir, null, runRoot)).rejects.toThrow(/No run command/)
  })

  it('runs a commit in a separate checkout and leaves the working tree alone', async () => {
    const first = commit('a.txt', 'one\n', 'First')
    commit('a.txt', 'two\n', 'Second')
    writeFileSync(join(dir, 'a.txt'), 'uncommitted\n')

    const plan = await planRun(dir, first, runRoot)

    expect(plan.cwd).toBe(runCheckoutPath(runRoot, dir))
    expect(plan.commit).toBe(first)
    expect(readFileSync(join(plan.cwd, 'a.txt'), 'utf8')).toBe('one\n')
    expect(git(plan.cwd, 'rev-parse', 'HEAD')).toBe(first)
    // The user's branch and changes are untouched.
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('uncommitted\n')
  })

  it('reuses the checkout for the next commit, even after a build touched tracked files', async () => {
    const first = commit('a.txt', 'one\n', 'First')
    const second = commit('a.txt', 'two\n', 'Second')
    const plan = await planRun(dir, first, runRoot)
    writeFileSync(join(plan.cwd, 'a.txt'), 'generated\n')

    const next = await planRun(dir, second, runRoot)

    expect(next.cwd).toBe(plan.cwd)
    expect(readFileSync(join(next.cwd, 'a.txt'), 'utf8')).toBe('two\n')
  })

  it('recreates the checkout when its folder was deleted', async () => {
    const first = commit('a.txt', 'one\n', 'First')
    const plan = await planRun(dir, first, runRoot)
    rmSync(plan.cwd, { recursive: true, force: true })

    const again = await planRun(dir, first, runRoot)
    expect(readFileSync(join(again.cwd, 'a.txt'), 'utf8')).toBe('one\n')
  })

  it('runs from the same folder inside the checkout when the repo was opened at a subfolder', async () => {
    mkdirSync(join(dir, 'app'))
    commit('app/package.json', '{"scripts":{"dev":"vite"}}', 'App')
    const head = git(dir, 'rev-parse', 'HEAD')
    commit('app/package.json', '{"scripts":{"dev":"vite --port 2"}}', 'Port')
    const app = join(dir, 'app')
    runCommands.set(app, 'npm run dev')
    writeFileSync(join(app, '.env'), 'SECRET=1\n')

    const plan = await planRun(app, head, runRoot)

    expect(plan.cwd).toBe(join(runCheckoutPath(runRoot, app), 'app'))
    expect(readFileSync(join(plan.cwd, 'package.json'), 'utf8')).toContain('"vite"')
    expect(readFileSync(join(plan.cwd, '.env'), 'utf8')).toBe('SECRET=1\n')
  })

  it('says so when the subfolder the repo was opened at is not in that commit', async () => {
    const first = commit('a.txt', 'one\n', 'First')
    mkdirSync(join(dir, 'app'))
    commit('app/package.json', '{}', 'App')
    runCommands.set(join(dir, 'app'), 'npm run dev')

    await expect(planRun(join(dir, 'app'), first, runRoot)).rejects.toThrow(/app doesn't exist at commit/)
  })

  it('starts over when an earlier checkout failed part way and left a folder behind', async () => {
    const first = commit('a.txt', 'one\n', 'First')
    const checkout = runCheckoutPath(runRoot, dir)
    mkdirSync(checkout, { recursive: true })
    writeFileSync(join(checkout, 'leftover.txt'), 'x')

    const plan = await planRun(dir, first, runRoot)
    expect(readFileSync(join(plan.cwd, 'a.txt'), 'utf8')).toBe('one\n')
  })

  it('copies untracked .env files into the checkout, but not tracked ones', async () => {
    commit('.env.example', 'EXAMPLE=1\n', 'Example env')
    const head = git(dir, 'rev-parse', 'HEAD')
    writeFileSync(join(dir, '.env'), 'SECRET=1\n')
    writeFileSync(join(dir, '.env.example'), 'EXAMPLE=changed\n')

    const plan = await planRun(dir, head, runRoot)

    expect(readFileSync(join(plan.cwd, '.env'), 'utf8')).toBe('SECRET=1\n')
    expect(readFileSync(join(plan.cwd, '.env.example'), 'utf8')).toBe('EXAMPLE=1\n')
  })

  it('installs dependencies until the lockfile it installed from is recorded', async () => {
    commit('package.json', '{"scripts":{"dev":"vite"}}', 'Package')
    const head = commit('package-lock.json', '{"lockfileVersion":3}', 'Lockfile')

    const plan = await planRun(dir, head, runRoot)
    expect(plan.script).toMatch(/^npm ci && printf %s '[0-9a-f]{40}' > '.*\.sillygit-installed-lock' && npm run dev$/)
    if (process.platform === 'win32') return

    // What the script records once `npm ci` succeeds.
    const hash = /printf %s '([0-9a-f]+)'/.exec(plan.script)![1]
    mkdirSync(join(plan.cwd, 'node_modules'))
    writeFileSync(join(plan.cwd, 'node_modules', '.sillygit-installed-lock'), hash)
    expect((await planRun(dir, head, runRoot)).script).toBe('npm run dev')

    const changed = commit('package-lock.json', '{"lockfileVersion":3,"x":1}', 'New dep')
    expect((await planRun(dir, changed, runRoot)).script).toMatch(/^npm ci && /)
  })
})

describe('suggestCommand', () => {
  it('guesses from package.json', async () => {
    writeFileSync(join(dir, 'package.json'), '{"scripts":{"dev":"vite"}}')
    expect(await suggestCommand(dir)).toBe('npm run dev')
    expect(existsSync(join(dir, 'nope'))).toBe(false)
    expect(await suggestCommand(join(dir, 'nope'))).toBe('')
  })
})
