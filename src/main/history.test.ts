import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from './git'

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function commitFile(name: string, content: string, message: string): void {
  writeFileSync(join(dir, name), content)
  run('add', name)
  run('commit', '-q', '-m', message)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-history-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
  commitFile('a.txt', 'one\n', 'First')
  commitFile('a.txt', 'two\n', 'Second')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('undo', () => {
  it('undoes a commit and keeps its changes staged', async () => {
    commitFile('b.txt', 'b\n', 'Add b')
    expect(await git.undoLabel(dir)).toBe('Undo commit “Add b”')
    await git.undo(dir)
    expect(run('log', '-1', '--format=%s')).toBe('Second')
    expect(run('diff', '--cached', '--name-only')).toBe('b.txt')
  })

  it('undoes an amend back to the original commit', async () => {
    writeFileSync(join(dir, 'a.txt'), 'three\n')
    run('add', 'a.txt')
    await git.commit(dir, 'Second, amended', true)
    await git.undo(dir)
    expect(run('log', '-1', '--format=%s')).toBe('Second')
    expect(run('diff', '--cached', '--name-only')).toBe('a.txt')
  })

  it('undoes a checkout', async () => {
    run('branch', 'feature')
    await git.checkoutBranch(dir, 'feature')
    expect(await git.undoLabel(dir)).toBe('Undo checkout of feature')
    await git.undo(dir)
    expect(run('branch', '--show-current')).toBe('main')
  })

  it('undoes a mixed reset without touching the working tree', async () => {
    await git.resetTo(dir, 'HEAD~1', 'mixed')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('two\n')
    await git.undo(dir)
    expect(run('log', '-1', '--format=%s')).toBe('Second')
    expect(run('status', '--porcelain')).toBe('')
  })

  it('undoes a hard reset', async () => {
    await git.resetTo(dir, 'HEAD~1', 'hard')
    await git.undo(dir)
    expect(run('log', '-1', '--format=%s')).toBe('Second')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('two\n')
  })

  it('refuses to undo a merge over uncommitted changes to the same file', async () => {
    run('checkout', '-q', '-b', 'feature')
    commitFile('a.txt', 'feature\n', 'Feature')
    run('checkout', '-q', 'main')
    run('merge', '-q', 'feature')
    writeFileSync(join(dir, 'a.txt'), 'local edit\n')
    await expect(git.undo(dir)).rejects.toThrow(/uncommitted changes/)
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('local edit\n')
  })

  it('has nothing to undo in a fresh repo', async () => {
    rmSync(dir, { recursive: true, force: true })
    dir = mkdtempSync(join(tmpdir(), 'sillygit-history-'))
    run('init', '-q')
    expect(await git.undoLabel(dir)).toBeNull()
  })
})

describe('redo', () => {
  it('puts an undone commit back', async () => {
    commitFile('b.txt', 'b\n', 'Add b')
    const hash = run('rev-parse', 'HEAD')
    expect(await git.redoLabel(dir)).toBeNull()
    await git.undo(dir)
    expect(await git.redoLabel(dir)).toBe('Redo commit “Add b”')
    await git.redo(dir)
    expect(run('rev-parse', 'HEAD')).toBe(hash)
    expect(run('status', '--porcelain')).toBe('')
    expect(await git.redoLabel(dir)).toBeNull()
  })

  it('checks the branch out again after undoing a checkout', async () => {
    run('branch', 'feature')
    run('checkout', '-q', 'feature')
    await git.undo(dir)
    expect(run('branch', '--show-current')).toBe('main')
    expect(await git.redoLabel(dir)).toBe('Redo checkout of feature')
    await git.redo(dir)
    expect(run('branch', '--show-current')).toBe('feature')
  })

  it('forgets the redo once HEAD moves on', async () => {
    commitFile('b.txt', 'b\n', 'Add b')
    await git.undo(dir)
    run('commit', '-q', '-m', 'Different')
    expect(await git.redoLabel(dir)).toBeNull()
    await expect(git.redo(dir)).rejects.toThrow(/nothing to redo/)
  })
})

describe('pull modes', () => {
  let remote: string

  beforeEach(() => {
    remote = mkdtempSync(join(tmpdir(), 'sillygit-remote-'))
    execFileSync('git', ['clone', '-q', '--bare', dir, remote])
    run('remote', 'add', 'origin', remote)
    run('fetch', '-q', 'origin')
    run('branch', '-q', '--set-upstream-to=origin/main')
    // Someone else pushes a commit while we make our own.
    const other = mkdtempSync(join(tmpdir(), 'sillygit-other-'))
    execFileSync('git', ['clone', '-q', remote, other])
    writeFileSync(join(other, 'theirs.txt'), 'theirs\n')
    for (const args of [
      ['add', 'theirs.txt'],
      ['-c', 'user.name=Other', '-c', 'user.email=o@example.com', 'commit', '-q', '-m', 'Theirs'],
      ['push', '-q']
    ]) {
      execFileSync('git', args, { cwd: other })
    }
    rmSync(other, { recursive: true, force: true })
    commitFile('mine.txt', 'mine\n', 'Mine')
  })

  afterEach(() => rmSync(remote, { recursive: true, force: true }))

  it('refuses to merge diverged branches when fast-forward only', async () => {
    await expect(git.pull(dir, 'ff-only')).rejects.toThrow()
    expect(run('log', '-1', '--format=%s')).toBe('Mine')
  })

  it('rebases local commits on top', async () => {
    await git.pull(dir, 'rebase')
    expect(run('log', '--format=%s', '-3').split('\n')).toEqual(['Mine', 'Theirs', 'Second'])
  })

  it('merges by default without opening an editor', async () => {
    await git.pull(dir)
    expect(run('log', '-1', '--format=%P').split(' ')).toHaveLength(2)
  })
})

describe('apply patch', () => {
  it('applies a patch made from a commit', async () => {
    commitFile('b.txt', 'b\n', 'Add b')
    const patchFile = join(tmpdir(), `sillygit-${Date.now()}.patch`)
    writeFileSync(patchFile, await git.createPatchFromCommit(dir, 'HEAD'))
    run('reset', '-q', '--hard', 'HEAD~1')
    expect(await git.applyPatch(dir, patchFile)).toEqual({ conflicts: false })
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('b\n')
    rmSync(patchFile)
  })
})

describe('activity log', () => {
  it('records commands that change the repo, not reads', async () => {
    await git.getStatus(dir)
    await git.createBranch(dir, 'logged-branch')
    const [latest] = git.activityLog()
    expect(latest.command).toBe('git checkout -b logged-branch')
    expect(latest.ok).toBe(true)
    expect(latest.repoPath).toBe(dir)
  })
})

describe('stashes', () => {
  it('lists, applies and drops stashes, including untracked files', async () => {
    writeFileSync(join(dir, 'new.txt'), 'new\n')
    await git.stash(dir, 'my work')
    writeFileSync(join(dir, 'a.txt'), 'edit\n')
    await git.stash(dir)
    const list = await git.listStashes(dir)
    expect(list.map((s) => s.ref)).toEqual(['stash@{0}', 'stash@{1}'])
    expect(list[1].message).toBe('On main: my work')
    await git.stashApply(dir, 'stash@{1}')
    expect(readFileSync(join(dir, 'new.txt'), 'utf8')).toBe('new\n')
    await git.stashDrop(dir, 'stash@{1}')
    expect((await git.listStashes(dir)).length).toBe(1)
    // Stash commits stay out of the graph.
    expect((await git.getGraphLog(dir)).map((c) => c.subject)).toEqual(['Second', 'First'])
  })
})

describe('searchCommits', () => {
  it('matches subject, author and hash prefix across all branches', async () => {
    run('checkout', '-q', '-b', 'feature')
    commitFile('c.txt', 'c\n', 'Add login page')
    const hash = run('rev-parse', 'HEAD')
    expect(await git.searchCommits(dir, 'LOGIN')).toEqual([{ hash, index: 0 }])
    expect(await git.searchCommits(dir, hash.slice(0, 7))).toEqual([{ hash, index: 0 }])
    expect((await git.searchCommits(dir, 'first')).map((h) => h.index)).toEqual([2])
    expect((await git.searchCommits(dir, 'lovelace')).length).toBe(3)
    expect(await git.searchCommits(dir, '  ')).toEqual([])
  })
})

describe('searchCommits modes', () => {
  function commitIn(path: string, content: string, message: string, author?: string): string {
    mkdirSync(join(dir, dirname(path)), { recursive: true })
    writeFileSync(join(dir, path), content)
    run('add', path)
    run('commit', '-q', ...(author ? ['--author', author] : []), '-m', message)
    return run('rev-parse', 'HEAD')
  }

  it('searches the message body, author, path and changes', async () => {
    const login = commitIn('src/main/login.ts', 'export const token = 1\n', 'Add login\n\nUses a SECRET handshake')
    const docs = commitIn('docs/guide.md', 'how to\n', 'Write the guide', 'Grace Hopper <grace@navy.mil>')
    const rename = commitIn('src/main/login.ts', 'export const bearer = 1\n', 'Rename the token')

    const hashes = async (query: Parameters<typeof git.searchCommits>[1]): Promise<string[]> =>
      (await git.searchCommits(dir, query)).map((h) => h.hash)

    // "All" now reads the body too.
    expect(await hashes('secret')).toEqual([login])
    expect(await hashes({ mode: 'message', term: 'handshake' })).toEqual([login])
    // Message mode doesn't match authors.
    expect(await hashes({ mode: 'message', term: 'grace' })).toEqual([])
    expect(await hashes({ mode: 'author', term: 'GRACE' })).toEqual([docs])
    expect(await hashes({ mode: 'author', term: 'navy.mil' })).toEqual([docs])
    expect(await hashes({ mode: 'path', term: 'LOGIN' })).toEqual([rename, login])
    expect(await hashes({ mode: 'path', term: 'src/main' })).toEqual([rename, login])
    expect(await hashes({ mode: 'path', term: 'guide' })).toEqual([docs])
    // -S: the commits that add or remove the text.
    expect(await hashes({ mode: 'change', term: 'token' })).toEqual([rename, login])
    expect(await hashes({ mode: 'change', term: 'bearer' })).toEqual([rename])
    // -G: the commits whose changed lines match.
    expect(await hashes({ mode: 'regex', term: 'export const (bearer|nope)' })).toEqual([rename])
    expect(await hashes({ mode: 'change', term: '  ' })).toEqual([])
  })

  it('gives positions in graph order', async () => {
    commitIn('x.txt', 'x\n', 'Change x')
    const hits = await git.searchCommits(dir, { mode: 'path', term: 'a.txt' })
    expect(hits.map((h) => h.index)).toEqual([1, 2])
  })

  it('throws on a regex git cannot read', async () => {
    await expect(git.searchCommits(dir, { mode: 'regex', term: '(' })).rejects.toThrow()
  })
})

describe('path filter', () => {
  function commitIn(path: string, content: string, message: string): string {
    mkdirSync(join(dir, dirname(path)), { recursive: true })
    writeFileSync(join(dir, path), content)
    run('add', path)
    run('commit', '-q', '-m', message)
    return run('rev-parse', 'HEAD')
  }

  it('narrows the graph to a folder and joins each commit to the next one touching it', async () => {
    const first = commitIn('src/main/a.ts', '1\n', 'Main one')
    commitIn('docs/x.md', 'd\n', 'Docs')
    run('checkout', '-q', '-b', 'feature')
    const onFeature = commitIn('src/main/a.ts', '2\n', 'Main on feature')
    run('checkout', '-q', 'main')
    commitIn('docs/x.md', 'e\n', 'More docs')

    const graph = await git.getGraphLog(dir, 500, { path: 'src/main' })
    expect(graph.map((c) => c.subject)).toEqual(['Main on feature', 'Main one'])
    // Its real parent is "Docs"; rewritten, it's the previous commit touching src/main.
    expect(graph[0].parents).toEqual([first])
    expect(graph[1].parents).toEqual([])

    expect((await git.getGraphLog(dir, 500, { path: 'MAIN/A', contains: true })).map((c) => c.hash)).toEqual([
      onFeature,
      first
    ])
    expect(await git.getGraphLog(dir, 500, { path: 'nowhere' })).toEqual([])
  })

  it('searches within the filter, counting positions in the filtered graph', async () => {
    commitIn('src/main/a.ts', '1\n', 'Fix main')
    commitIn('docs/x.md', 'd\n', 'Fix docs')
    const later = commitIn('src/main/a.ts', '2\n', 'Fix main again')
    const filter = { path: 'src/main' }
    expect(await git.searchCommits(dir, 'fix', 2000, filter)).toEqual([
      { hash: later, index: 0 },
      { hash: run('rev-parse', 'HEAD~2'), index: 1 }
    ])
    expect(await git.searchCommits(dir, { mode: 'message', term: 'docs' }, 2000, filter)).toEqual([])
    // A path search inside a path filter finds only commits touching both.
    expect(await git.searchCommits(dir, { mode: 'path', term: 'x.md' }, 2000, filter)).toEqual([])
    expect((await git.searchCommits(dir, { mode: 'path', term: 'a.ts' }, 2000, filter)).map((h) => h.index)).toEqual([0, 1])
  })
})

describe('commit --amend', () => {
  it('rewrites the last message', async () => {
    await git.commit(dir, 'Second, reworded', true)
    expect(await git.lastCommitMessage(dir)).toBe('Second, reworded')
    expect(run('rev-list', '--count', 'HEAD')).toBe('2')
  })
})

describe('co-authors and signatures', () => {
  it('reads co-author trailers into the commit detail', async () => {
    writeFileSync(join(dir, 'b.txt'), 'b\n')
    run('add', 'b.txt')
    run('commit', '-q', '--no-gpg-sign', '-m', 'Add b\n\nPaired on it.\n\nCo-authored-by: Grace Hopper <grace@example.com>')
    const detail = await git.getCommitDetail(dir, 'HEAD')
    expect(detail.coAuthors).toEqual([{ name: 'Grace Hopper', email: 'grace@example.com' }])
    expect(detail.signature).toMatchObject({ status: 'unsigned', code: 'N' })
  })

  it('suggests everyone else who has committed, busiest first', async () => {
    const as = (name: string, email: string, file: string): void => {
      writeFileSync(join(dir, file), name)
      run('add', file)
      run('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `By ${name}`)
    }
    as('Grace Hopper', 'grace@example.com', 'g1')
    as('Linus', 'linus@example.com', 'l1')
    as('Grace Hopper', 'grace@example.com', 'g2')
    expect(await git.getCoAuthorCandidates(dir)).toEqual([
      { name: 'Grace Hopper', email: 'grace@example.com', commits: 2 },
      { name: 'Linus', email: 'linus@example.com', commits: 1 }
    ])
  })
})

const hasGpg = (() => {
  try {
    execFileSync('gpg', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!hasGpg)('signature badges with gpg', () => {
  let gnupgHome: string
  const savedHome = process.env.GNUPGHOME

  beforeEach(() => {
    gnupgHome = mkdtempSync(join(tmpdir(), 'sillygit-gpg-'))
    process.env.GNUPGHOME = gnupgHome
    execFileSync('gpg', ['--batch', '--passphrase', '', '--quick-gen-key', 'Ada Lovelace <ada@example.com>', 'ed25519', 'sign', 'never'], {
      stdio: 'ignore'
    })
    // Whatever the machine signs with, these tests sign with gpg.
    run('config', 'gpg.format', 'openpgp')
    run('config', 'user.signingkey', 'ada@example.com')
  })

  afterEach(() => {
    if (savedHome === undefined) delete process.env.GNUPGHOME
    else process.env.GNUPGHOME = savedHome
    try {
      execFileSync('gpgconf', ['--kill', 'all'], { env: { ...process.env, GNUPGHOME: gnupgHome }, stdio: 'ignore' })
    } catch {
      // No agent to stop.
    }
    rmSync(gnupgHome, { recursive: true, force: true })
  })

  it('calls a commit signed with a trusted key verified', async () => {
    run('commit', '-q', '--allow-empty', '-S', '-m', 'Signed')
    expect(await git.getCommitSignature(dir, 'HEAD')).toMatchObject({
      status: 'verified',
      code: 'G',
      signer: 'Ada Lovelace <ada@example.com>'
    })
  })

  it('calls it unverified when the key is not available', async () => {
    run('commit', '-q', '--allow-empty', '-S', '-m', 'Signed')
    process.env.GNUPGHOME = mkdtempSync(join(tmpdir(), 'sillygit-gpg-empty-'))
    const signature = await git.getCommitSignature(dir, 'HEAD')
    rmSync(process.env.GNUPGHOME, { recursive: true, force: true })
    expect(signature).toMatchObject({ status: 'unverified', code: 'E' })
  })
})

describe('a signature git has nothing to check against', () => {
  it('calls an SSH-signed commit unverified, not unsigned', async () => {
    // A commit object carrying an SSH signature header, made by hand so no ssh-keygen is needed.
    const tree = run('rev-parse', 'HEAD^{tree}')
    const sig = ['-----BEGIN SSH SIGNATURE-----', 'U1NIU0lH', '-----END SSH SIGNATURE-----']
    const body = [
      `tree ${tree}`,
      'author Ada Lovelace <ada@example.com> 1700000000 +0000',
      'committer Ada Lovelace <ada@example.com> 1700000000 +0000',
      `gpgsig ${sig[0]}`,
      ...sig.slice(1).map((l) => ` ${l}`),
      '',
      'Signed by hand',
      ''
    ].join('\n')
    const hash = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: dir, input: body, encoding: 'utf8' }).trim()
    expect(await git.getCommitSignature(dir, hash)).toMatchObject({
      status: 'unverified',
      reason: expect.stringContaining('allowedSignersFile')
    })
  })
})

describe('graph scope', () => {
  beforeEach(() => {
    run('checkout', '-q', '-b', 'feat')
    commitFile('f.txt', 'f\n', 'On feat')
    run('checkout', '-q', '-b', 'other', 'main')
    commitFile('o.txt', 'o\n', 'On other')
    run('checkout', '-q', 'main')
    commitFile('m.txt', 'm\n', 'On main')
  })

  const subjects = async (scope: Parameters<typeof git.getGraphLog>[3]): Promise<string[]> =>
    (await git.getGraphLog(dir, 100, null, scope)).map((c) => c.subject)

  it('leaves hidden branches out, but never the checked-out one', async () => {
    const scope = { hidden: [{ name: 'feat', remote: false }, { name: 'main', remote: false }], solo: null, currentOnly: false }
    // Commits made in the same second can come in either order.
    expect((await subjects(scope)).sort()).toEqual(['First', 'On main', 'On other', 'Second'])
  })

  it('shows only a soloed branch, even when another is checked out', async () => {
    expect(await subjects({ hidden: [], solo: { name: 'feat', remote: false }, currentOnly: false })).toEqual([
      'On feat',
      'Second',
      'First'
    ])
  })

  it('shows only the current branch', async () => {
    expect(await subjects({ hidden: [], solo: null, currentOnly: true })).toEqual(['On main', 'Second', 'First'])
  })

  it('searches only the branches the graph shows', async () => {
    const scope = { hidden: [], solo: null, currentOnly: true }
    expect(await git.searchCommits(dir, 'on main', undefined, null, scope)).toEqual([{ hash: run('rev-parse', 'main'), index: 0 }])
    expect(await git.searchCommits(dir, { mode: 'message', term: 'On feat' }, undefined, null, scope)).toEqual([])
  })

  it('still works with a path filter', async () => {
    expect(
      (await git.getGraphLog(dir, 100, { path: 'f.txt' }, { hidden: [], solo: { name: 'feat', remote: false }, currentOnly: false })).map(
        (c) => c.subject
      )
    ).toEqual(['On feat'])
  })
})
