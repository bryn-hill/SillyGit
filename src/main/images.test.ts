import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from './git'

const RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==', 'base64')
const BLUE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAADCAIAAAA/Y+msAAAAEElEQVR4nGNgYPiPgYgRAgDtWRHvQsLkFAAAAABJRU5ErkJggg==', 'base64')

let dir: string
const run = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const bytesOf = (dataUrl: string | undefined): Buffer | null =>
  dataUrl ? Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64') : null

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-images-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  writeFileSync(join(dir, 'logo.png'), RED)
  run('add', '.')
  run('commit', '-q', '-m', 'Add logo')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const change = { hash: null, staged: false, untracked: false, path: 'logo.png' }

describe('getImagePair', () => {
  it('compares the index with the working copy for an unstaged change, byte for byte', async () => {
    writeFileSync(join(dir, 'logo.png'), BLUE)
    const pair = await git.getImagePair(dir, change)
    expect(bytesOf(pair.before?.dataUrl)).toEqual(RED)
    expect(bytesOf(pair.after?.dataUrl)).toEqual(BLUE)
    expect(pair.after?.bytes).toBe(BLUE.length)
  })

  it('compares HEAD with the index for a staged change', async () => {
    writeFileSync(join(dir, 'logo.png'), BLUE)
    run('add', '.')
    writeFileSync(join(dir, 'logo.png'), RED)
    const pair = await git.getImagePair(dir, { ...change, staged: true })
    expect(bytesOf(pair.before?.dataUrl)).toEqual(RED)
    expect(bytesOf(pair.after?.dataUrl)).toEqual(BLUE)
  })

  it('compares a commit with its parent, with no before for the first commit', async () => {
    const first = run('rev-parse', 'HEAD')
    writeFileSync(join(dir, 'logo.png'), BLUE)
    run('commit', '-q', '-am', 'Blue')
    const second = await git.getImagePair(dir, { ...change, hash: run('rev-parse', 'HEAD') })
    expect(bytesOf(second.before?.dataUrl)).toEqual(RED)
    expect((await git.getImagePair(dir, { ...change, hash: first })).before).toBeNull()
  })

  it('has no after for a deleted image and no before for an untracked one', async () => {
    run('rm', '-q', 'logo.png')
    run('commit', '-q', '-m', 'Delete')
    expect((await git.getImagePair(dir, { ...change, hash: run('rev-parse', 'HEAD') })).after).toBeNull()
    writeFileSync(join(dir, 'new.png'), BLUE)
    const untracked = await git.getImagePair(dir, { ...change, path: 'new.png', untracked: true })
    expect(untracked.before).toBeNull()
    expect(bytesOf(untracked.after?.dataUrl)).toEqual(BLUE)
  })

  it('refuses paths outside the repository and files that are not images', async () => {
    await expect(git.getImagePair(dir, { ...change, path: '../x.png', untracked: true })).rejects.toThrow(/outside/)
    await expect(git.getImagePair(dir, { ...change, path: 'a.txt' })).rejects.toThrow(/isn't an image/)
  })
})
