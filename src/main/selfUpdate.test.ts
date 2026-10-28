import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyUpdate, checkForUpdate, findCheckout, resolveCheckout } from './selfUpdate'
import { blockedReason, needsInstall, type SelfUpdateStep } from '../shared/selfUpdate'

let root: string
let remote: string
// The checkout SillyGit runs from, and another clone that pushes new work to main.
let app: string
let dev: string

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

function clone(name: string): string {
  const dir = join(root, name)
  execFileSync('git', ['clone', '-q', remote, dir])
  git(dir, 'config', 'user.name', 'Ada')
  git(dir, 'config', 'user.email', 'ada@example.com')
  return dir
}

function pushChange(file: string, content: string, message: string): void {
  writeFileSync(join(dev, file), content)
  git(dev, 'add', '.')
  git(dev, 'commit', '-q', '-m', message)
  git(dev, 'push', '-q', 'origin', 'main')
}

function hooks(): { steps: SelfUpdateStep[]; npmCalls: string[][]; npm: (root: string, args: string[]) => Promise<void>; onStep: (s: SelfUpdateStep) => void } {
  const steps: SelfUpdateStep[] = []
  const npmCalls: string[][] = []
  return {
    steps,
    npmCalls,
    onStep: (s) => steps.push(s),
    npm: async (_root, args) => {
      npmCalls.push(args)
    }
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sillygit-self-update-'))
  remote = join(root, 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  dev = join(root, 'dev')
  execFileSync('git', ['init', '-q', '-b', 'main', dev])
  git(dev, 'config', 'user.name', 'Ada')
  git(dev, 'config', 'user.email', 'ada@example.com')
  writeFileSync(join(dev, 'package.json'), '{"name":"sillygit"}\n')
  writeFileSync(join(dev, 'app.ts'), 'one\n')
  git(dev, 'add', '.')
  git(dev, 'commit', '-q', '-m', 'First')
  git(dev, 'remote', 'add', 'origin', remote)
  git(dev, 'push', '-q', '-u', 'origin', 'main')
  app = clone('app')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('findCheckout', () => {
  it('finds the top of the checkout from a folder inside it, and null outside one', async () => {
    expect(await findCheckout(app)).toBe(git(app, 'rev-parse', '--show-toplevel'))
    expect(await findCheckout(tmpdir())).toBeNull()
  })
})

describe('resolveCheckout', () => {
  const source = { isPackaged: false, isE2E: false, override: undefined, appPath: '' }

  it('uses the checkout SillyGit runs from', async () => {
    expect(await resolveCheckout({ ...source, appPath: app })).toBe(git(app, 'rev-parse', '--show-toplevel'))
  })

  it('is null for a packaged build, even from inside a checkout or with an override', async () => {
    expect(await resolveCheckout({ ...source, isPackaged: true, appPath: app })).toBeNull()
    expect(await resolveCheckout({ ...source, isPackaged: true, override: app })).toBeNull()
  })

  it('is null in e2e runs unless a test points it at a checkout', async () => {
    expect(await resolveCheckout({ ...source, isE2E: true, appPath: app })).toBeNull()
    expect(await resolveCheckout({ ...source, isE2E: true, override: dev })).toBe(dev)
  })
})

describe('checkForUpdate', () => {
  it('fetches and lists the commits main is ahead by, newest first', async () => {
    pushChange('app.ts', 'two\n', 'feat: two')
    pushChange('app.ts', 'three\n', 'feat: three')
    const status = await checkForUpdate(app)
    expect(status).toMatchObject({ supported: true, branch: 'main', behind: 2, ahead: 0, dirty: false, blocked: null, error: null })
    expect(status.incoming.map((c) => c.subject)).toEqual(['feat: three', 'feat: two'])
    expect(status.checkedAt).not.toBeNull()
  })

  it("says why it can't update from another branch or with unpushed commits", async () => {
    git(app, 'checkout', '-q', '-b', 'experiment')
    expect((await checkForUpdate(app)).blocked).toMatch(/on the branch experiment/)

    git(app, 'checkout', '-q', 'main')
    writeFileSync(join(app, 'app.ts'), 'local\n')
    git(app, 'commit', '-q', '-am', 'local work')
    expect((await checkForUpdate(app)).blocked).toMatch(/1 commit that isn't on origin\/main/)
  })

  it('reports a failed fetch without throwing', async () => {
    git(app, 'remote', 'set-url', 'origin', join(root, 'missing.git'))
    const status = await checkForUpdate(app)
    expect(status.error).toBeTruthy()
    expect(status.checkedAt).toBeNull()
  })
})

describe('applyUpdate', () => {
  it('fast-forwards and rebuilds without installing when the dependencies are unchanged', async () => {
    pushChange('app.ts', 'two\n', 'feat: two')
    const h = hooks()
    const result = await applyUpdate(app, h)
    expect(result).toEqual({ updated: true, installed: false, stashedChanges: null })
    expect(readFileSync(join(app, 'app.ts'), 'utf8')).toBe('two\n')
    expect(h.npmCalls).toEqual([['run', 'build']])
    expect(h.steps).toEqual(['fetching', 'pulling', 'building'])
  })

  it('runs npm install when package.json changed', async () => {
    pushChange('package.json', '{"name":"sillygit","dependencies":{"x":"1"}}\n', 'build(deps): add x')
    const h = hooks()
    const result = await applyUpdate(app, h)
    expect(result.installed).toBe(true)
    expect(h.npmCalls).toEqual([['install'], ['run', 'build']])
  })

  it('does nothing when already up to date', async () => {
    const h = hooks()
    expect(await applyUpdate(app, h)).toEqual({ updated: false, installed: false, stashedChanges: null })
    expect(h.npmCalls).toEqual([])
  })

  it("keeps uncommitted changes that don't clash with the update", async () => {
    writeFileSync(join(dev, 'other.ts'), 'x\n')
    pushChange('app.ts', 'two\n', 'feat: two')
    writeFileSync(join(app, 'package.json'), '{"name":"sillygit","local":true}\n')
    const result = await applyUpdate(app, hooks())
    expect(result.stashedChanges).toBeNull()
    expect(readFileSync(join(app, 'app.ts'), 'utf8')).toBe('two\n')
    expect(readFileSync(join(app, 'package.json'), 'utf8')).toContain('"local":true')
    expect(git(app, 'stash', 'list')).toBe('')
  })

  it('leaves clashing changes in a stash and a clean checkout', async () => {
    pushChange('app.ts', 'two\n', 'feat: two')
    writeFileSync(join(app, 'app.ts'), 'mine\n')
    const result = await applyUpdate(app, hooks())
    expect(result.updated).toBe(true)
    expect(result.stashedChanges).toBe('stash@{0}')
    expect(readFileSync(join(app, 'app.ts'), 'utf8')).toBe('two\n')
    expect(git(app, 'status', '--porcelain')).toBe('')
    expect(git(app, 'stash', 'list')).toContain('SillyGit update')
    expect(git(app, 'show', 'stash@{0}:app.ts')).toBe('mine')
  })

  it('refuses from another branch and leaves it alone', async () => {
    pushChange('app.ts', 'two\n', 'feat: two')
    git(app, 'checkout', '-q', '-b', 'experiment')
    await expect(applyUpdate(app, hooks())).rejects.toThrow(/on the branch experiment/)
    expect(readFileSync(join(app, 'app.ts'), 'utf8')).toBe('one\n')
  })

  it('puts local changes back when the pull fails', async () => {
    pushChange('new.ts', 'theirs\n', 'feat: new file')
    // An untracked file in the way stops the fast-forward.
    writeFileSync(join(app, 'new.ts'), 'untracked\n')
    writeFileSync(join(app, 'app.ts'), 'mine\n')
    await expect(applyUpdate(app, hooks())).rejects.toThrow()
    expect(readFileSync(join(app, 'app.ts'), 'utf8')).toBe('mine\n')
    expect(git(app, 'stash', 'list')).toBe('')
  })
})

describe('needsInstall', () => {
  it('is true only for package.json or the lockfile at the root', () => {
    expect(needsInstall(['src/a.ts', 'package-lock.json'])).toBe(true)
    expect(needsInstall(['package.json'])).toBe(true)
    expect(needsInstall(['src/a.ts', 'e2e/package.json'])).toBe(false)
  })
})

describe('blockedReason', () => {
  it('allows main with nothing unpushed', () => {
    expect(blockedReason('main', 0)).toBeNull()
    expect(blockedReason(null, 0)).toMatch(/isn't on a branch/)
    expect(blockedReason('main', 3)).toMatch(/3 commits/)
  })
})
