import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyLane,
  commitLane,
  createLane,
  enterLanes,
  forgetLanes,
  lanesStatus,
  leaveLanes,
  moveToLane,
  moveWorkspaceCommits,
  refreshWorkspace,
  renameLane,
  unapplyLane,
  undoLaneChange
} from './lanes'

// Real repositories: lanes are all about what git and the files end up holding.

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function write(name: string, content: string): void {
  writeFileSync(join(dir, name), content)
}

function read(name: string): string {
  return readFileSync(join(dir, name), 'utf8')
}

/** The file as committed on `ref`. */
function show(ref: string, name: string): string {
  return execFileSync('git', ['show', `${ref}:${name}`], { cwd: dir, encoding: 'utf8' })
}

const numbered = (n: number, change: Record<number, string> = {}): string =>
  Array.from({ length: n }, (_, i) => change[i + 1] ?? `line ${i + 1}`).join('\n') + '\n'

async function filesOf(lane: string): Promise<string[]> {
  const status = await lanesStatus(dir)
  return status!.files.filter((f) => f.lane === lane).map((f) => f.path)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-lanes-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  write('a.txt', numbered(30))
  write('b.txt', 'b\n')
  run('add', '.')
  run('commit', '-q', '-m', 'First')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('lanes', () => {
  it('turns on without touching files, every change in the first lane', async () => {
    write('a.txt', numbered(30, { 2: 'two' }))
    write('new.txt', 'new\n')
    await enterLanes(dir, 'main', 'feature')
    expect(run('symbolic-ref', '--short', 'HEAD')).toBe('sillygit/workspace')
    expect(read('a.txt')).toBe(numbered(30, { 2: 'two' }))
    const status = await lanesStatus(dir)
    expect(status!.lanes.map((l) => [l.name, l.applied, l.isDefault])).toEqual([['feature', true, true]])
    expect(status!.files).toEqual([
      { path: 'a.txt', lane: 'feature', status: 'M', added: 1, removed: 1, untracked: false },
      { path: 'new.txt', lane: 'feature', status: 'A', added: 0, removed: 0, untracked: true }
    ])
    expect(status!.drift).toBeNull()
  })

  it('commits two lanes separately out of one file', async () => {
    await enterLanes(dir, 'main', 'one')
    await createLane(dir, 'two')
    write('a.txt', numbered(30, { 2: 'one says hi', 25: 'two says hi' }))
    await moveToLane(dir, 'two', { lines: [{ path: 'a.txt', kind: '+', line: 25 }, { path: 'a.txt', kind: '-', line: 25 }] })
    await commitLane(dir, 'one', 'One')
    await commitLane(dir, 'two', 'Two')

    expect(show('one', 'a.txt')).toBe(numbered(30, { 2: 'one says hi' }))
    expect(show('two', 'a.txt')).toBe(numbered(30, { 25: 'two says hi' }))
    expect(run('log', '--format=%s', 'one')).toBe('One\nFirst')
    // Both are in the workspace, so nothing is left uncommitted and the file is as typed.
    expect((await lanesStatus(dir))!.files).toEqual([])
    expect(read('a.txt')).toBe(numbered(30, { 2: 'one says hi', 25: 'two says hi' }))
    expect(run('diff', 'HEAD', '--stat')).toBe('')
  })

  it('keeps owners while you keep typing, and new lines join their neighbours', async () => {
    await enterLanes(dir, 'main', 'one')
    await createLane(dir, 'two')
    write('a.txt', numbered(30, { 25: 'two' }))
    await moveToLane(dir, 'two', { files: [{ path: 'a.txt' }] })
    // More typing: next to two's line, and far away (which goes to the default lane).
    write('a.txt', numbered(30, { 2: 'far away', 25: 'two', 26: 'two again' }))
    const status = await lanesStatus(dir)
    const owner = (kind: '+' | '-', line: number): string | undefined =>
      status!.lines.find((l) => l.kind === kind && l.line === line)?.lane
    expect(owner('+', 25)).toBe('two')
    expect(owner('+', 26)).toBe('two')
    expect(owner('+', 2)).toBe('one')
    // A line inserted above shifts everything; owners follow the text.
    write('a.txt', 'top\n' + numbered(30, { 2: 'far away', 25: 'two', 26: 'two again' }))
    const after = await lanesStatus(dir)
    expect(after!.lines.find((l) => l.kind === '+' && l.line === 26)?.lane).toBe('two')
    expect(after!.lines.find((l) => l.kind === '+' && l.line === 3)?.lane).toBe('one')
  })

  it('unapplies a lane, setting its work aside, and applies it back', async () => {
    await enterLanes(dir, 'main', 'one')
    await createLane(dir, 'two')
    write('b.txt', 'b by two\n')
    write('two-new.txt', 'brand new\n')
    await moveToLane(dir, 'two', { files: [{ path: 'b.txt' }, { path: 'two-new.txt' }] })
    await commitLane(dir, 'two', 'Two b')
    write('a.txt', numbered(30, { 1: 'one' }))
    write('a2.txt', 'two more\n')
    await moveToLane(dir, 'two', { files: [{ path: 'a2.txt' }] })
    write('b.txt', 'b by two, uncommitted\n')

    await unapplyLane(dir, 'two')
    // Two's commit and its uncommitted work are gone from the files; one's stays.
    expect(read('b.txt')).toBe('b\n')
    expect(existsSync(join(dir, 'two-new.txt'))).toBe(false)
    expect(existsSync(join(dir, 'a2.txt'))).toBe(false)
    expect(read('a.txt')).toBe(numbered(30, { 1: 'one' }))
    expect(run('rev-parse', '--verify', 'refs/sillygit/wip/two')).toMatch(/^[0-9a-f]{40}$/)
    expect(await filesOf('one')).toEqual(['a.txt'])

    await applyLane(dir, 'two')
    expect(read('b.txt')).toBe('b by two, uncommitted\n')
    expect(read('two-new.txt')).toBe('brand new\n')
    expect(read('a2.txt')).toBe('two more\n')
    expect(await filesOf('two')).toEqual(['a2.txt', 'b.txt'])
    expect(await filesOf('one')).toEqual(['a.txt'])
    expect(() => run('rev-parse', '--verify', '-q', 'refs/sillygit/wip/two')).toThrow()
  })

  it('refuses to commit lines that only fit on top of another lane', async () => {
    await enterLanes(dir, 'main', 'one')
    await createLane(dir, 'two')
    write('a.txt', numbered(30, { 10: 'one', 11: 'one too', 12: 'one three' }))
    await commitLane(dir, 'one', 'One')
    // Two edits the line one just changed: it doesn't exist on two's branch.
    write('a.txt', numbered(30, { 10: 'one', 11: 'two rewrote this', 12: 'one three' }))
    await moveToLane(dir, 'two', { files: [{ path: 'a.txt' }] })
    await expect(commitLane(dir, 'two', 'Two')).rejects.toThrow(/sit on lines another lane changed/)
    // Nothing moved.
    expect(run('log', '--format=%s', 'two')).toBe('First')
    expect(read('a.txt')).toBe(numbered(30, { 10: 'one', 11: 'two rewrote this', 12: 'one three' }))
  })

  it('applies an existing branch, and refuses one that conflicts', async () => {
    run('checkout', '-q', '-b', 'side')
    write('b.txt', 'side b\n')
    run('commit', '-q', '-am', 'Side')
    run('checkout', '-q', '-b', 'clash', 'main')
    write('b.txt', 'clashing b\n')
    run('commit', '-q', '-am', 'Clash')
    run('checkout', '-q', 'main')
    await enterLanes(dir, 'main', 'one')
    await applyLane(dir, 'side')
    expect(read('b.txt')).toBe('side b\n')
    await expect(applyLane(dir, 'clash')).rejects.toThrow(/conflicts with/)
    expect(read('b.txt')).toBe('side b\n')
    expect((await lanesStatus(dir))!.lanes.map((l) => l.name)).toEqual(['one', 'side'])
  })

  it('leaves lanes onto one lane with its changes, setting the others aside', async () => {
    await enterLanes(dir, 'main', 'one')
    await createLane(dir, 'two')
    write('a.txt', numbered(30, { 1: 'one' }))
    write('b.txt', 'two\n')
    write('two.txt', 'two new\n')
    await moveToLane(dir, 'two', { files: [{ path: 'b.txt' }, { path: 'two.txt' }] })
    await leaveLanes(dir, 'one')
    expect(run('symbolic-ref', '--short', 'HEAD')).toBe('one')
    expect(read('a.txt')).toBe(numbered(30, { 1: 'one' }))
    expect(read('b.txt')).toBe('b\n')
    expect(existsSync(join(dir, 'two.txt'))).toBe(false)
    expect(run('status', '--porcelain')).toBe('M a.txt')
    expect(await lanesStatus(dir)).toBeNull()
    expect(() => run('rev-parse', '--verify', '-q', 'refs/heads/sillygit/workspace')).toThrow()
    // Two's work comes back with it next time.
    await enterLanes(dir, 'main', 'one')
    await applyLane(dir, 'two')
    expect(read('b.txt')).toBe('two\n')
    expect(read('two.txt')).toBe('two new\n')
  })

  it('moves a terminal commit on the workspace into a lane', async () => {
    await enterLanes(dir, 'main', 'one')
    write('b.txt', 'from the terminal\n')
    run('commit', '-q', '-am', 'Terminal commit')
    expect((await lanesStatus(dir))!.drift).toEqual({ kind: 'commits', count: 1 })
    await expect(commitLane(dir, 'one', 'x')).rejects.toThrow(/outside SillyGit/)
    expect(await moveWorkspaceCommits(dir, 'one')).toBe(1)
    expect(run('log', '--format=%s %an', 'one')).toBe('Terminal commit Ada Lovelace\nFirst Ada Lovelace')
    const status = await lanesStatus(dir)
    expect(status!.drift).toBeNull()
    expect(status!.files).toEqual([])
    expect(read('b.txt')).toBe('from the terminal\n')
  })

  it('notices a checkout elsewhere, and can forget the lanes', async () => {
    await enterLanes(dir, 'main', 'one')
    run('checkout', '-q', 'main')
    expect((await lanesStatus(dir))!.drift).toEqual({ kind: 'switched', branch: 'main' })
    await forgetLanes(dir)
    expect(await lanesStatus(dir)).toBeNull()
    expect(run('branch', '--format=%(refname:short)')).toBe('main\none')
  })

  it('rebuilds the workspace when a lane branch moves outside SillyGit', async () => {
    await enterLanes(dir, 'main', 'one')
    await createLane(dir, 'two')
    // Someone commits to two in another worktree.
    const tree = run('rev-parse', 'two^{tree}')
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: 'two elsewhere\n', encoding: 'utf8' }).trim()
    const index = join(dir, '.git', 'tmp-index')
    execFileSync('git', ['read-tree', tree], { cwd: dir, env: { ...process.env, GIT_INDEX_FILE: index } })
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${blob},elsewhere.txt`], { cwd: dir, env: { ...process.env, GIT_INDEX_FILE: index } })
    const newTree = execFileSync('git', ['write-tree'], { cwd: dir, env: { ...process.env, GIT_INDEX_FILE: index }, encoding: 'utf8' }).trim()
    const commit = run('commit-tree', newTree, '-p', 'two', '-m', 'Elsewhere')
    run('update-ref', 'refs/heads/two', commit)
    expect((await lanesStatus(dir))!.drift).toEqual({ kind: 'lanes-moved', lanes: ['two'] })
    await refreshWorkspace(dir)
    expect(read('elsewhere.txt')).toBe('two elsewhere\n')
    expect((await lanesStatus(dir))!.drift).toBeNull()
  })

  it('undoes a lane commit', async () => {
    await enterLanes(dir, 'main', 'one')
    write('b.txt', 'changed\n')
    await commitLane(dir, 'one', 'Change b')
    expect((await lanesStatus(dir))!.undoLabel).toBe('Undo commit to one')
    expect(await undoLaneChange(dir)).toBe('Undo commit to one')
    expect(run('log', '--format=%s', 'one')).toBe('First')
    expect(read('b.txt')).toBe('changed\n')
    expect(await filesOf('one')).toEqual(['b.txt'])
  })

  it('undoes applying a lane, taking its files and set-aside changes back out', async () => {
    await enterLanes(dir, 'main', 'one')
    await createLane(dir, 'two')
    write('two.txt', 'two\n')
    await moveToLane(dir, 'two', { files: [{ path: 'two.txt' }] })
    await unapplyLane(dir, 'two')
    const wip = run('rev-parse', 'refs/sillygit/wip/two')
    await applyLane(dir, 'two')
    expect(read('two.txt')).toBe('two\n')
    expect(await undoLaneChange(dir)).toBe('Undo applying two')
    expect(existsSync(join(dir, 'two.txt'))).toBe(false)
    expect(run('rev-parse', 'refs/sillygit/wip/two')).toBe(wip)
    expect((await lanesStatus(dir))!.lanes.map((l) => [l.name, l.applied])).toEqual([['one', true], ['two', false]])
    // The files as they were before the undo are kept too.
    expect(run('for-each-ref', '--format=%(refname)', 'refs/sillygit/undone/')).toMatch(/^refs\/sillygit\/undone\/\d+$/)
  })

  it('renames a lane and keeps what it owns', async () => {
    await enterLanes(dir, 'main', 'one')
    await createLane(dir, 'two')
    write('b.txt', 'two\n')
    await moveToLane(dir, 'two', { files: [{ path: 'b.txt' }] })
    await renameLane(dir, 'two', 'second')
    expect(await filesOf('second')).toEqual(['b.txt'])
    expect(run('branch', '--format=%(refname:short)', '--list', 'second')).toBe('second')
  })

  it('runs the commit-msg hook on lane commits', async () => {
    write('hook.sh', '#!/bin/sh\ngrep -q "^feat" "$1" || { echo "not conventional" >&2; exit 1; }\n')
    run('config', 'core.hooksPath', 'hooks')
    execFileSync('mkdir', ['-p', join(dir, 'hooks')])
    execFileSync('mv', [join(dir, 'hook.sh'), join(dir, 'hooks', 'commit-msg')])
    execFileSync('chmod', ['+x', join(dir, 'hooks', 'commit-msg')])
    await enterLanes(dir, 'main', 'one')
    write('b.txt', 'changed\n')
    await moveToLane(dir, 'one', { files: [{ path: 'b.txt' }] })
    await expect(commitLane(dir, 'one', 'Bad message')).rejects.toThrow(/not conventional/)
    await commitLane(dir, 'one', 'feat: good message')
    expect(run('log', '-1', '--format=%s', 'one')).toBe('feat: good message')
  })
})
