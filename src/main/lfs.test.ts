import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from './git'
import { activityLog } from './gitExec'

const hasLfs = (() => {
  try {
    execFileSync('git', ['lfs', 'version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

// A 1x1 PNG, so the image diff has something real to draw.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

let dir: string
const run = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-lfs-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  writeFileSync(join(dir, 'readme.md'), 'hi\n')
  run('add', '.')
  run('commit', '-q', '-m', 'Start')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe.skipIf(!hasLfs)('Git LFS', () => {
  beforeEach(() => {
    run('lfs', 'install', '--local')
    run('lfs', 'track', '*.dat', '*.png')
    writeFileSync(join(dir, 'notes.dat'), 'line one\nline two\n')
    writeFileSync(join(dir, 'pic.png'), PNG)
    run('add', '.')
    run('commit', '-q', '-m', 'Add LFS files')
  })

  it('finds the patterns and the installed version', async () => {
    const info = await git.getLfsInfo(dir)
    expect(info.installed).toBe(true)
    expect(info.version).toMatch(/^\d+\.\d+/)
    // git lfs track writes patterns in its own order, which differs between versions.
    expect([...info.patterns].sort()).toEqual(['*.dat', '*.png'])
  })

  it('badges LFS files in the working changes, not the others', async () => {
    writeFileSync(join(dir, 'notes.dat'), 'line one\nline 2\n')
    writeFileSync(join(dir, 'readme.md'), 'hello\n')
    writeFileSync(join(dir, 'new.dat'), 'new\n')
    const status = await git.getStatus(dir)
    const lfs = Object.fromEntries(status.unstaged.map((f) => [f.path, !!f.lfs]))
    expect(lfs).toEqual({ 'notes.dat': true, 'readme.md': false, 'new.dat': true })
  })

  it('badges LFS files in a commit', async () => {
    const detail = await git.getCommitDetail(dir, run('rev-parse', 'HEAD'))
    expect(detail.files.filter((f) => f.lfs).map((f) => f.path).sort()).toEqual(['notes.dat', 'pic.png'])
    expect(detail.files.find((f) => f.path === '.gitattributes')?.lfs).toBeUndefined()
  })

  it('shows the real change behind a pointer diff', async () => {
    writeFileSync(join(dir, 'notes.dat'), 'line one\nline 2\n')
    run('commit', '-q', '-am', 'Edit notes')
    const hash = run('rev-parse', 'HEAD')
    expect(await git.getCommitFileDiff(dir, hash, 'notes.dat')).toContain('+oid sha256:')

    const lfs = await git.getLfsDiff(dir, { hash, staged: false, untracked: false, path: 'notes.dat' })
    expect(lfs.kind).toBe('text')
    const diff = lfs.kind === 'text' ? lfs.diff : ''
    expect(diff).toContain('--- a/notes.dat')
    expect(diff).toContain('+++ b/notes.dat')
    expect(diff).toContain('-line two')
    expect(diff).toContain('+line 2')
    expect(diff).not.toContain('sillygit-lfs-')
  })

  it('compares the index with the working copy for an unstaged LFS change', async () => {
    writeFileSync(join(dir, 'notes.dat'), 'line one\nline two\nline three\n')
    const lfs = await git.getLfsDiff(dir, { hash: null, staged: false, untracked: false, path: 'notes.dat' })
    expect(lfs.kind === 'text' && lfs.diff).toContain('+line three')
  })

  it('gives sizes for a binary LFS file, with no before when it was added', async () => {
    const lfs = await git.getLfsDiff(dir, { hash: run('rev-parse', 'HEAD'), staged: false, untracked: false, path: 'pic.png' })
    expect(lfs).toEqual({ kind: 'binary', before: null, after: PNG.length })
  })

  it('draws an LFS image from its stored file, not its pointer', async () => {
    const pair = await git.getImagePair(dir, { hash: run('rev-parse', 'HEAD'), staged: false, untracked: false, path: 'pic.png' })
    expect(pair.after?.dataUrl).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
  })

  it('tracks a new pattern in .gitattributes and logs it', async () => {
    await git.lfsTrack(dir, '*.psd')
    expect(readFileSync(join(dir, '.gitattributes'), 'utf8')).toContain('*.psd filter=lfs diff=lfs merge=lfs -text')
    expect((await git.getLfsInfo(dir)).patterns).toContain('*.psd')
    expect(activityLog()[0]).toMatchObject({ repoPath: dir, command: 'git lfs track -- *.psd', ok: true })
  })

  it('prunes without a remote', async () => {
    await expect(git.lfsCommand(dir, 'prune')).resolves.toBeUndefined()
  })
})

describe('Git LFS without LFS files', () => {
  it('marks nothing and finds no patterns', async () => {
    writeFileSync(join(dir, 'readme.md'), 'changed\n')
    const status = await git.getStatus(dir)
    expect(status.unstaged[0].lfs).toBeUndefined()
    expect((await git.getLfsInfo(dir)).patterns).toEqual([])
  })
})
