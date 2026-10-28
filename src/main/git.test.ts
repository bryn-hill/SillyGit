import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from './git'
import { buildPatchForUnits, parseCommitDiff } from '../shared/diffSplit'

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function write(name: string, content: string): void {
  writeFileSync(join(dir, name), content)
}

function commitFile(name: string, content: string, message: string): string {
  write(name, content)
  run('add', name)
  run('commit', '-q', '-m', message)
  return run('rev-parse', 'HEAD')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-git-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  run('config', 'commit.gpgsign', 'false')
  commitFile('a.txt', 'one\n', 'First')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('isGitRepo', () => {
  it('is true inside a work tree and false outside one', async () => {
    expect(await git.isGitRepo(dir)).toBe(true)
    const plain = mkdtempSync(join(tmpdir(), 'sillygit-plain-'))
    try {
      expect(await git.isGitRepo(plain)).toBe(false)
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})

describe('getStatus', () => {
  it('sorts changes into staged, unstaged and untracked', async () => {
    commitFile('b.txt', 'b\n', 'Add b')
    write('a.txt', 'staged\n')
    run('add', 'a.txt')
    write('a.txt', 'staged then edited\n')
    write('b.txt', 'edited\n')
    write('new file.txt', 'untracked with a space\n')

    const status = await git.getStatus(dir)
    expect(status.branch).toBe('main')
    expect(status.upstream).toBeNull()
    expect(status.staged.map((f) => f.path)).toEqual(['a.txt'])
    expect(status.unstaged.map((f) => [f.path, f.untracked])).toEqual([
      ['a.txt', false],
      ['b.txt', false],
      ['new file.txt', true]
    ])
    expect(status.conflicted).toEqual([])
  })

  it('reads a staged rename with its original path', async () => {
    run('mv', 'a.txt', 'renamed a.txt')
    const status = await git.getStatus(dir)
    expect(status.staged).toEqual([
      { path: 'renamed a.txt', origPath: 'a.txt', index: 'R', worktree: '.', untracked: false }
    ])
  })

  it('keeps odd characters in paths as they are', async () => {
    const name = 'tab\there "quoted" ünï.txt'
    write(name, 'x\n')
    const status = await git.getStatus(dir)
    expect(status.unstaged.map((f) => f.path)).toEqual([name])
  })

  it('lists conflicted files on their own', async () => {
    run('checkout', '-q', '-b', 'other')
    commitFile('a.txt', 'theirs\n', 'Theirs')
    run('checkout', '-q', 'main')
    commitFile('a.txt', 'ours\n', 'Ours')
    try {
      run('merge', 'other')
    } catch {
      // Expected: the merge stops on the conflict.
    }
    const status = await git.getStatus(dir)
    expect(status.conflicted.map((f) => [f.path, f.index, f.worktree])).toEqual([['a.txt', 'U', 'U']])
    expect(status.staged).toEqual([])
    expect(status.unstaged).toEqual([])
  })

  it('reports a detached HEAD as no branch, and counts ahead and behind', async () => {
    const remote = mkdtempSync(join(tmpdir(), 'sillygit-remote-'))
    try {
      execFileSync('git', ['init', '-q', '--bare', remote])
      run('remote', 'add', 'origin', remote)
      run('push', '-q', '-u', 'origin', 'main')
      commitFile('a.txt', 'two\n', 'Ahead 1')
      commitFile('a.txt', 'three\n', 'Ahead 2')
      const status = await git.getStatus(dir)
      expect(status).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 2, behind: 0 })

      run('checkout', '-q', '--detach')
      expect((await git.getStatus(dir)).branch).toBeNull()
    } finally {
      rmSync(remote, { recursive: true, force: true })
    }
  })
})

describe('push', () => {
  it('sets the upstream when the branch has none', async () => {
    const remote = mkdtempSync(join(tmpdir(), 'sillygit-remote-'))
    try {
      execFileSync('git', ['init', '-q', '--bare', remote])
      run('remote', 'add', 'origin', remote)
      run('checkout', '-q', '-b', 'feature')
      commitFile('a.txt', 'two\n', 'On feature')
      await git.push(dir)
      expect(run('rev-parse', '--abbrev-ref', 'feature@{upstream}')).toBe('origin/feature')
      commitFile('a.txt', 'three\n', 'More')
      await git.push(dir)
      expect(run('rev-list', '--count', 'origin/feature..feature')).toBe('0')
    } finally {
      rmSync(remote, { recursive: true, force: true })
    }
  })
})

describe('staging', () => {
  it('stages and unstages single files and everything', async () => {
    write('a.txt', 'changed\n')
    write('b.txt', 'new\n')
    await git.stageFiles(dir, ['a.txt'])
    expect(run('diff', '--cached', '--name-only')).toBe('a.txt')
    await git.unstageFiles(dir, ['a.txt'])
    expect(run('diff', '--cached', '--name-only')).toBe('')
    await git.stageAll(dir)
    expect(run('diff', '--cached', '--name-only').split('\n')).toEqual(['a.txt', 'b.txt'])
    await git.unstageAll(dir)
    expect(run('diff', '--cached', '--name-only')).toBe('')
  })

  it('does nothing for an empty list', async () => {
    await git.stageFiles(dir, [])
    await git.unstageFiles(dir, [])
  })

  it('discards tracked edits and deletes untracked files', async () => {
    write('a.txt', 'changed\n')
    write('junk.txt', 'junk\n')
    await git.discardFile(dir, 'a.txt', false)
    await git.discardFile(dir, 'junk.txt', true)
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('one\n')
    expect(run('status', '--porcelain')).toBe('')
  })
})

describe('commit', () => {
  it('commits and amends, and reads back the full message', async () => {
    write('a.txt', 'two\n')
    run('add', 'a.txt')
    await git.commit(dir, 'Second\n\nWith a body')
    expect(await git.lastCommitMessage(dir)).toBe('Second\n\nWith a body')
    await git.commit(dir, 'Second, reworded', true)
    expect(run('rev-list', '--count', 'HEAD')).toBe('2')
    expect(await git.lastCommitMessage(dir)).toBe('Second, reworded')
  })

  it('has an empty last message in a repo with no commits', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'sillygit-empty-'))
    try {
      await git.initRepo(empty)
      expect(await git.lastCommitMessage(empty)).toBe('')
      expect(await git.getGraphLog(empty)).toEqual([])
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('getDiff', () => {
  it('diffs staged and unstaged changes separately', async () => {
    write('a.txt', 'staged\n')
    run('add', 'a.txt')
    write('a.txt', 'working\n')
    expect(await git.getDiff(dir, 'a.txt', true, false)).toContain('+staged')
    const unstaged = await git.getDiff(dir, 'a.txt', false, false)
    expect(unstaged).toContain('-staged')
    expect(unstaged).toContain('+working')
  })

  it('shows an untracked file as all added lines', async () => {
    write('new.txt', 'hello\nworld\n')
    const diff = await git.getDiff(dir, 'new.txt', false, true)
    expect(diff).toContain('new file mode')
    expect(diff).toContain('+hello\n+world')
    expect(diff).not.toContain('Command failed')
  })
})

describe('listBranches', () => {
  it('lists local branches with the current one and upstreams, then remote branches', async () => {
    const remote = mkdtempSync(join(tmpdir(), 'sillygit-remote-'))
    try {
      execFileSync('git', ['init', '-q', '--bare', remote])
      run('remote', 'add', 'origin', remote)
      run('push', '-q', '-u', 'origin', 'main')
      run('remote', 'set-head', 'origin', 'main')
      run('branch', 'feature/x')
      const head = run('rev-parse', 'HEAD')

      const date = Number(run('log', '-1', '--format=%ct'))

      expect(await git.listBranches(dir)).toEqual([
        { name: 'feature/x', current: false, remote: false, hash: head, upstream: undefined, lastCommitAt: date },
        {
          name: 'main',
          current: true,
          remote: false,
          hash: head,
          upstream: 'origin/main',
          ahead: 0,
          behind: 0,
          upstreamGone: false,
          lastCommitAt: date
        },
        // origin/HEAD is a symbolic ref and is left out.
        { name: 'origin/main', current: false, remote: true, hash: head, lastCommitAt: date }
      ])
    } finally {
      rmSync(remote, { recursive: true, force: true })
    }
  })

  it('reports ahead/behind and upstreams deleted on the remote', async () => {
    const remote = mkdtempSync(join(tmpdir(), 'sillygit-remote-'))
    const other = mkdtempSync(join(tmpdir(), 'sillygit-other-'))
    try {
      execFileSync('git', ['init', '-q', '--bare', remote])
      run('remote', 'add', 'origin', remote)
      run('push', '-q', '-u', 'origin', 'main')
      run('branch', 'done')
      run('push', '-q', '-u', 'origin', 'done')
      // Someone else pushes to main and deletes "done".
      execFileSync('git', ['clone', '-q', '-b', 'main', remote, other])
      const theirs = (...args: string[]): string => execFileSync('git', args, { cwd: other, encoding: 'utf8' })
      theirs('-c', 'user.name=Bo', '-c', 'user.email=bo@example.com', 'commit', '-q', '--allow-empty', '-m', 'Theirs')
      theirs('push', '-q', 'origin', 'main', ':done')
      commitFile('mine.txt', 'mine\n', 'Mine')
      run('fetch', '-q', '--prune')

      const byName = new Map((await git.listBranches(dir)).map((b) => [b.name, b]))
      expect(byName.get('main')).toMatchObject({ ahead: 1, behind: 1, upstreamGone: false })
      expect(byName.get('done')).toMatchObject({ upstream: 'origin/done', upstreamGone: true })
      expect(byName.has('origin/done')).toBe(false)
    } finally {
      rmSync(remote, { recursive: true, force: true })
      rmSync(other, { recursive: true, force: true })
    }
  })
})

describe('logs', () => {
  it('lists recent commits newest first', async () => {
    commitFile('a.txt', 'two\n', 'Second')
    const log = await git.getLog(dir)
    expect(log.map((c) => [c.subject, c.author])).toEqual([
      ['Second', 'Ada Lovelace'],
      ['First', 'Ada Lovelace']
    ])
    expect(log[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(await git.getLog(dir, 1)).toHaveLength(1)
  })

  it('builds the graph log with parents, refs and no stash commits', async () => {
    const first = run('rev-parse', 'HEAD')
    run('tag', 'v1')
    run('checkout', '-q', '-b', 'side')
    const side = commitFile('s.txt', 's\n', 'Side')
    run('checkout', '-q', 'main')
    commitFile('a.txt', 'two\n', 'Main')
    run('merge', '-q', '--no-ff', '-m', 'Merge side', 'side')
    write('a.txt', 'stashed\n')
    run('stash', '-q')

    const graph = await git.getGraphLog(dir)
    expect(graph.map((c) => c.subject)).toEqual(['Merge side', 'Main', 'Side', 'First'])
    const merge = graph[0]
    expect(merge.parents).toHaveLength(2)
    expect(merge.parents).toContain(side)
    expect(merge.refs).toEqual(['HEAD -> main'])
    expect(merge.authorEmail).toBe('ada@example.com')
    expect(graph[3]).toMatchObject({ hash: first, parents: [], refs: ['tag: v1'] })
    expect(graph.find((c) => c.subject === 'Side')!.refs).toEqual(['side'])
  })

  it('follows a file through a rename', async () => {
    commitFile('a.txt', 'one\ntwo\nthree\nfour\n', 'Grow a')
    run('mv', 'a.txt', 'b.txt')
    run('commit', '-q', '-m', 'Rename a to b')
    commitFile('other.txt', 'x\n', 'Unrelated')
    const history = await git.getFileHistory(dir, 'b.txt', 'HEAD')
    expect(history.map((c) => c.subject)).toEqual(['Rename a to b', 'Grow a', 'First'])
    expect(history.map((c) => [c.status, c.path, c.oldPath])).toEqual([
      ['R', 'b.txt', 'a.txt'],
      ['M', 'a.txt', undefined],
      ['A', 'a.txt', undefined]
    ])
    expect(history[0]).toMatchObject({ author: 'Ada Lovelace', authorEmail: 'ada@example.com' })
    expect(history[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('shows the file diff of a renaming commit as a rename when given both paths', async () => {
    commitFile('a.txt', 'one\ntwo\nthree\nfour\n', 'Grow a')
    run('mv', 'a.txt', 'b.txt')
    write('b.txt', 'one\ntwo\nthree\nfour!\n')
    run('add', '-A')
    run('commit', '-q', '-m', 'Rename and edit')
    const diff = await git.getCommitFileDiff(dir, 'HEAD', 'b.txt', false, 'a.txt')
    expect(diff).toContain('rename from a.txt')
    expect(diff).toContain('+four!')
    expect(diff).not.toContain('+one')
  })

  it('lists tracked files', async () => {
    commitFile('dir with space.txt', 'x\n', 'Add')
    write('untracked.txt', 'u\n')
    expect(await git.listTrackedFiles(dir)).toEqual(['a.txt', 'dir with space.txt'])
  })
})

describe('getCommitDetail', () => {
  it('reads the header, a multi-line body and the changed files', async () => {
    write('a.txt', 'two\n')
    write('b.txt', 'b\n')
    run('add', '.')
    run('commit', '-q', '-m', 'Subject line', '-m', 'Body one\nBody two', '-m', 'Closes #1')
    const detail = await git.getCommitDetail(dir, 'HEAD')
    expect(detail).toMatchObject({
      subject: 'Subject line',
      author: 'Ada Lovelace',
      authorEmail: 'ada@example.com',
      body: 'Body one\nBody two\nCloses #1'
    })
    expect(detail.parents).toHaveLength(1)
    expect(detail.files).toEqual([
      { status: 'M', path: 'a.txt' },
      { status: 'A', path: 'b.txt' }
    ])
  })

  it('reads renames and deletions', async () => {
    commitFile('gone.txt', 'bye\n', 'Add gone')
    run('mv', 'a.txt', 'moved.txt')
    run('rm', '-q', 'gone.txt')
    run('commit', '-q', '-m', 'Move and delete')
    const detail = await git.getCommitDetail(dir, 'HEAD')
    expect(detail.body).toBe('')
    expect(detail.files).toEqual([
      { status: 'D', path: 'gone.txt' },
      { status: 'R', origPath: 'a.txt', path: 'moved.txt' }
    ])
  })

  it('has no parents for the root commit', async () => {
    const detail = await git.getCommitDetail(dir, 'HEAD')
    expect(detail.parents).toEqual([])
    expect(detail.files).toEqual([{ status: 'A', path: 'a.txt' }])
  })
})

describe('stashes', () => {
  it('lists, applies, drops and pops stashes', async () => {
    write('a.txt', 'first stash\n')
    await git.stash(dir, 'first')
    write('untracked.txt', 'u\n')
    await git.stash(dir)
    const stashes = await git.listStashes(dir)
    expect(stashes.map((s) => s.ref)).toEqual(['stash@{0}', 'stash@{1}'])
    expect(stashes[1].message).toBe('On main: first')
    expect(stashes[0].message).toMatch(/^WIP on main/)
    expect(stashes[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    // The default stash takes untracked files too.
    expect(run('status', '--porcelain')).toBe('')
    await git.stashApply(dir, 'stash@{1}')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('first stash\n')
    run('checkout', '--', 'a.txt')
    await git.stashDrop(dir, 'stash@{1}')
    await git.stashPop(dir)
    expect(readFileSync(join(dir, 'untracked.txt'), 'utf8')).toBe('u\n')
    expect(await git.listStashes(dir)).toEqual([])
  })
})

describe('getBlame', () => {
  it('gives every line its commit, author and summary', async () => {
    commitFile('a.txt', 'one\ntwo\n', 'Add two')
    commitFile('a.txt', 'one\ntwo\nthree\n', 'Add three')
    const blame = await git.getBlame(dir, 'HEAD', 'a.txt')
    expect(blame.map((b) => [b.lineNo, b.summary])).toEqual([
      [1, 'First'],
      [2, 'Add two'],
      [3, 'Add three']
    ])
    expect(blame.every((b) => b.author === 'Ada Lovelace')).toBe(true)
    expect(new Date(blame[0].date).getTime()).not.toBeNaN()
  })

  it('repeats the details for lines from the same commit that are not together', async () => {
    commitFile('c.txt', 'top\nmiddle\nend\n', 'Three lines')
    commitFile('c.txt', 'top\nchanged\nend\n', 'Change the middle')
    const blame = await git.getBlame(dir, 'HEAD', 'c.txt')
    expect(blame.map((b) => b.summary)).toEqual(['Three lines', 'Change the middle', 'Three lines'])
    expect(blame[0].hash).toBe(blame[2].hash)
  })

  it('gives the author email, the path in each commit and the commit before', async () => {
    const first = run('rev-parse', 'HEAD')
    run('mv', 'a.txt', 'b.txt')
    run('commit', '-q', '-m', 'Rename')
    const edit = commitFile('b.txt', 'one\ntwo\n', 'Add two')
    const blame = await git.getBlame(dir, 'HEAD', 'b.txt')
    expect(blame[0]).toMatchObject({ hash: first, path: 'a.txt', authorEmail: 'ada@example.com', uncommitted: false })
    expect(blame[0].previous).toBeUndefined()
    expect(blame[1]).toMatchObject({ hash: edit, path: 'b.txt' })
    expect(blame[1].previous?.path).toBe('b.txt')
    expect(blame[1].previous?.hash).toBe(run('rev-parse', 'HEAD~1'))
  })

  it('blames the working tree when no ref is given, marking uncommitted lines', async () => {
    write('a.txt', 'one\nnot yet\n')
    const blame = await git.getBlame(dir, null, 'a.txt')
    expect(blame.map((b) => b.uncommitted)).toEqual([false, true])
    expect(blame[1].hash).toMatch(/^0+$/)
  })
})

describe('searchCommits', () => {
  it('finds commits by subject, author, email or hash prefix, with their graph index', async () => {
    commitFile('a.txt', 'two\n', 'Fix the login bug')
    run('-c', 'user.name=Grace Hopper', '-c', 'user.email=grace@navy.mil', 'commit', '-q', '--allow-empty', '-m', 'Compile')
    const hashes = run('log', '--format=%H').split('\n')

    expect(await git.searchCommits(dir, 'LOGIN')).toEqual([{ hash: hashes[1], index: 1 }])
    expect(await git.searchCommits(dir, 'grace')).toEqual([{ hash: hashes[0], index: 0 }])
    expect(await git.searchCommits(dir, 'navy.mil')).toHaveLength(1)
    expect(await git.searchCommits(dir, hashes[2].slice(0, 8))).toEqual([{ hash: hashes[2], index: 2 }])
    expect(await git.searchCommits(dir, 'ada', 1)).toHaveLength(1)
    expect(await git.searchCommits(dir, '   ')).toEqual([])
  })
})

describe('revertHunk', () => {
  it('undoes one hunk of a commit in the working tree, leaving the others', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)
    commitFile('a.txt', lines.join('\n') + '\n', 'Thirty lines')
    const edited = [...lines]
    edited[1] = 'CHANGED 2'
    edited[27] = 'CHANGED 28'
    const hash = commitFile('a.txt', edited.join('\n') + '\n', 'Two edits')

    const diff = await git.getCommitFullDiff(dir, hash)
    const { units } = parseCommitDiff(diff)
    expect(units).toHaveLength(2)
    await git.revertHunk(dir, diff, units[0].id)

    const now = readFileSync(join(dir, 'a.txt'), 'utf8')
    expect(now).toContain('line 2\n')
    expect(now).toContain('CHANGED 28\n')
  })

  it('refuses a hunk id that is not in the diff', async () => {
    const hash = commitFile('a.txt', 'two\n', 'Second')
    const diff = await git.getCommitFullDiff(dir, hash)
    await expect(git.revertHunk(dir, diff, 'nope')).rejects.toThrow(/no longer matches/)
  })

  it('fails without touching the file when it has moved on too far', async () => {
    const hash = commitFile('a.txt', 'two\n', 'Second')
    const diff = await git.getCommitFullDiff(dir, hash)
    commitFile('a.txt', 'something else entirely\n', 'Third')
    const { units } = parseCommitDiff(diff)
    await expect(git.revertHunk(dir, diff, units[0].id)).rejects.toThrow(/Could not revert/)
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('something else entirely\n')
  })
})

describe('applyCommitSplit', () => {
  function makeTwoFileCommit(): { parent: string; head: string; tree: string; diff: string } {
    const parent = run('rev-parse', 'HEAD')
    write('a.txt', 'two\n')
    write('b.txt', 'b\n')
    run('add', '.')
    run('commit', '-q', '-m', 'Both')
    return { parent, head: run('rev-parse', 'HEAD'), tree: run('rev-parse', 'HEAD^{tree}'), diff: run('diff', '--binary', parent, 'HEAD') + '\n' }
  }

  it('replaces a commit with one commit per group, ending on the same tree', async () => {
    const { parent, head, tree } = makeTwoFileCommit()
    const diff = await git.getDiffForSplit(dir, parent, head)
    const { fileBlocks, units } = parseCommitDiff(diff)
    const [a, b] = units
    await git.applyCommitSplit(dir, head, parent, tree, [
      { message: 'Change a', patch: buildPatchForUnits(fileBlocks, new Set([a.id])) },
      { message: 'Add b', patch: buildPatchForUnits(fileBlocks, new Set([a.id, b.id])) }
    ])
    expect(run('log', '--format=%s', '-3').split('\n')).toEqual(['Add b', 'Change a', 'First'])
    expect(run('rev-parse', 'HEAD^{tree}')).toBe(tree)
  })

  it('puts the original commit back when the groups miss something', async () => {
    const { parent, head, tree } = makeTwoFileCommit()
    const diff = await git.getDiffForSplit(dir, parent, head)
    const { fileBlocks, units } = parseCommitDiff(diff)
    await expect(
      git.applyCommitSplit(dir, head, parent, tree, [
        { message: 'Only a', patch: buildPatchForUnits(fileBlocks, new Set([units[0].id])) }
      ])
    ).rejects.toThrow(/did not match/)
    expect(run('rev-parse', 'HEAD')).toBe(head)
    expect(run('status', '--porcelain')).toBe('')
  })

  it('refuses when HEAD moved or the tree is dirty', async () => {
    const { parent, head, tree } = makeTwoFileCommit()
    await expect(git.applyCommitSplit(dir, parent, parent, tree, [])).rejects.toThrow(/HEAD has changed/)
    write('a.txt', 'dirty\n')
    await expect(git.applyCommitSplit(dir, head, parent, tree, [])).rejects.toThrow(/must be clean/)
    expect(run('rev-parse', 'HEAD')).toBe(head)
  })
})

describe('refs and patches', () => {
  it('creates branches and tags at a commit', async () => {
    const first = run('rev-parse', 'HEAD')
    commitFile('a.txt', 'two\n', 'Second')
    await git.createBranchAt(dir, 'old', first, false)
    expect(run('branch', '--show-current')).toBe('main')
    expect(run('rev-parse', 'old')).toBe(first)
    await git.createBranchAt(dir, 'old-checked-out', first)
    expect(run('branch', '--show-current')).toBe('old-checked-out')

    await git.createTag(dir, 'light', first)
    await git.createAnnotatedTag(dir, 'v1.0.0', 'Release', first)
    expect(run('cat-file', '-t', 'light')).toBe('commit')
    expect(run('cat-file', '-t', 'v1.0.0')).toBe('tag')
    expect(run('rev-parse', 'v1.0.0^{commit}')).toBe(first)
  })

  it('makes a patch that applies elsewhere', async () => {
    const hash = commitFile('a.txt', 'two\n', 'Second')
    const patch = await git.createPatchFromCommit(dir, hash)
    expect(patch).toMatch(/^From [0-9a-f]{40} /)
    expect(patch).toContain('Subject: [PATCH] Second')

    run('reset', '-q', '--hard', 'HEAD~1')
    const file = join(dir, '..', `sillygit-${Date.now()}.patch`)
    writeFileSync(file, patch)
    try {
      expect(await git.applyPatch(dir, file)).toEqual({ conflicts: false })
      expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('two\n')
    } finally {
      rmSync(file, { force: true })
    }
  })

  it('reads files at a ref and in the working tree', async () => {
    commitFile('a.txt', 'two\n', 'Second')
    write('a.txt', 'working\n')
    expect(await git.getFileAtRef(dir, 'HEAD~1', 'a.txt')).toBe('one\n')
    expect(await git.getWorkingFileContent(dir, 'a.txt')).toBe('working\n')
    expect(await git.isWorkingTreeClean(dir)).toBe(false)
  })
})

describe('clone', () => {
  it('clones into a folder named after the URL, and refuses one that exists', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'sillygit-clone-'))
    try {
      const source = join(parent, 'source.git')
      execFileSync('git', ['clone', '-q', '--bare', dir, source])
      const into = join(parent, 'into')
      mkdirSync(into)
      const dest = await git.clone(source, into)
      expect(dest).toBe(join(into, 'source'))
      expect(readFileSync(join(dest, 'a.txt'), 'utf8')).toBe('one\n')
      await expect(git.clone(source, into)).rejects.toThrow(/already exists/)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })
})
