import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from './git'
import { parseCommitDiff } from '../shared/diffSplit'

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
}

const lines = (n: number, f: (i: number) => string = (i) => `line ${i}`): string =>
  Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n'

/** Body indexes of the hunk's lines whose text is in `texts`. */
function indexesOf(diff: string, hunk: number, texts: string[]): number[] {
  const body = parseCommitDiff(diff).units[hunk].body.split('\n').filter((l) => !l.startsWith('\\'))
  return body.flatMap((l, i) => (/^[-+]/.test(l) && texts.includes(l.slice(1)) ? [i] : []))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-partial-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  writeFileSync(join(dir, 'a.txt'), lines(30))
  run('add', '.')
  run('commit', '-q', '-m', 'First')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('applyPartial', () => {
  // Two hunks: line 3 replaced, line 25 replaced and a line added after it.
  const edited = (): string =>
    lines(30, (i) => (i === 3 ? 'three' : i === 25 ? 'twenty-five\nextra' : `line ${i}`))

  it('stages one hunk and leaves the other unstaged', async () => {
    writeFileSync(join(dir, 'a.txt'), edited())
    const diff = await git.getDiff(dir, 'a.txt', false, false)
    await git.applyPartial(dir, diff, 'f0h1', null, 'stage')
    const staged = run('diff', '--cached')
    expect(staged).toContain('+twenty-five')
    expect(staged).not.toContain('+three')
    expect(run('diff')).toContain('+three')
  })

  it('stages only the selected lines of a hunk', async () => {
    writeFileSync(join(dir, 'a.txt'), edited())
    const diff = await git.getDiff(dir, 'a.txt', false, false)
    await git.applyPartial(dir, diff, 'f0h1', indexesOf(diff, 1, ['extra']), 'stage')
    const index = run('show', ':a.txt')
    expect(index).toContain('line 25\nextra\n')
    expect(index).not.toContain('twenty-five')
  })

  it('stages a removal without its replacement', async () => {
    writeFileSync(join(dir, 'a.txt'), edited())
    const diff = await git.getDiff(dir, 'a.txt', false, false)
    await git.applyPartial(dir, diff, 'f0h0', indexesOf(diff, 0, ['line 3']), 'stage')
    expect(run('show', ':a.txt')).toContain('line 2\nline 4\n')
  })

  it('unstages selected lines and keeps the rest staged', async () => {
    writeFileSync(join(dir, 'a.txt'), edited())
    run('add', 'a.txt')
    const diff = await git.getDiff(dir, 'a.txt', true, false)
    await git.applyPartial(dir, diff, 'f0h1', indexesOf(diff, 1, ['extra']), 'unstage')
    const index = run('show', ':a.txt')
    expect(index).toContain('twenty-five\nline 26')
    expect(index).not.toContain('extra')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe(edited())
  })

  it('discards selected lines from the working copy only', async () => {
    writeFileSync(join(dir, 'a.txt'), edited())
    const diff = await git.getDiff(dir, 'a.txt', false, false)
    await git.applyPartial(dir, diff, 'f0h1', indexesOf(diff, 1, ['extra']), 'discard')
    const file = readFileSync(join(dir, 'a.txt'), 'utf8')
    expect(file).toContain('twenty-five\nline 26')
    expect(file).toContain('three')
    expect(run('diff', '--cached')).toBe('')
  })

  it('stages part of a new file', async () => {
    writeFileSync(join(dir, 'new.txt'), 'keep\nskip\n')
    const diff = await git.getDiff(dir, 'new.txt', false, true)
    await git.applyPartial(dir, diff, 'f0h0', indexesOf(diff, 0, ['keep']), 'stage')
    expect(run('show', ':new.txt')).toBe('keep\n')
  })

  it('handles a file with no newline at the end', async () => {
    writeFileSync(join(dir, 'a.txt'), lines(30) + 'tail')
    const diff = await git.getDiff(dir, 'a.txt', false, false)
    await git.applyPartial(dir, diff, 'f0h0', null, 'stage')
    expect(run('show', ':a.txt').endsWith('line 30\ntail')).toBe(true)
  })

  it('refuses a selection with no changed lines', async () => {
    writeFileSync(join(dir, 'a.txt'), edited())
    const diff = await git.getDiff(dir, 'a.txt', false, false)
    await expect(git.applyPartial(dir, diff, 'f0h0', [], 'stage')).rejects.toThrow(/Select at least one/)
  })

  it('fails cleanly when the file moved on since the diff', async () => {
    writeFileSync(join(dir, 'a.txt'), edited())
    const diff = await git.getDiff(dir, 'a.txt', false, false)
    writeFileSync(join(dir, 'a.txt'), lines(30))
    await expect(git.applyPartial(dir, diff, 'f0h0', null, 'discard')).rejects.toThrow(/changed since/)
  })
})
