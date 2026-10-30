import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'E2E Tester',
  GIT_AUTHOR_EMAIL: 'e2e@example.com',
  GIT_COMMITTER_NAME: 'E2E Tester',
  GIT_COMMITTER_EMAIL: 'e2e@example.com'
}

/** A throwaway git repository with a known history. */
export class FixtureRepo {
  /** Commit subjects, newest first, as the commit graph lists them. */
  static readonly commits = ['Add hello.txt', 'Initial commit'] as const

  readonly path: string

  constructor() {
    this.path = mkdtempSync(join(tmpdir(), 'sillygit-e2e-repo-'))
    this.git('init', '-q', '-b', 'main')
    this.commitFile('README.md', '# Fixture repo\n', 'Initial commit')
    this.commitFile('hello.txt', 'hello\nworld\n', 'Add hello.txt')
  }

  get name(): string {
    return basename(this.path)
  }

  writeFile(relativePath: string, content: string | Buffer): void {
    const path = join(this.path, relativePath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }

  commitFile(relativePath: string, content: string | Buffer, message: string): void {
    this.writeFile(relativePath, content)
    this.git('add', relativePath)
    this.git('commit', '-q', '-m', message)
  }

  /** Like commitFile, but authored and committed at `date` (ISO 8601). */
  commitFileAt(relativePath: string, content: string, message: string, date: string): void {
    this.writeFile(relativePath, content)
    this.git('add', relativePath)
    execFileSync('git', ['commit', '-q', '-m', message], {
      cwd: this.path,
      env: { ...process.env, ...GIT_IDENTITY, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    })
  }

  /**
   * Adds `notes.txt` on main, then a `feature` branch and a new main commit
   * that both change its 2nd and 8th lines differently: two conflict hunks
   * when merged. Leaves main checked out.
   */
  addConflictingBranch(): void {
    const lines = (second: string, eighth: string): string =>
      ['one', second, 'three', 'four', 'five', 'six', 'seven', eighth, 'nine', 'ten'].join('\n') + '\n'
    this.commitFile('notes.txt', lines('two', 'eight'), 'Add notes')
    this.git('checkout', '-q', '-b', 'feature')
    this.commitFile('notes.txt', lines('two (feature)', 'eight (feature)'), 'Edit notes on feature')
    this.git('checkout', '-q', 'main')
    this.commitFile('notes.txt', lines('two (main)', 'eight (main)'), 'Edit notes on main')
  }

  /** Adds `doomed.txt`, then a `feature` branch that deletes it while main edits it. */
  addModifyDeleteBranch(): void {
    this.commitFile('doomed.txt', 'keep me\n', 'Add doomed')
    this.git('checkout', '-q', '-b', 'feature')
    this.git('rm', '-q', 'doomed.txt')
    this.git('commit', '-q', '-m', 'Delete doomed')
    this.git('checkout', '-q', 'main')
    this.commitFile('doomed.txt', 'keep me, edited\n', 'Edit doomed')
  }

  /** Adds a `name` branch with one new file, and a new main commit so the two have diverged. Leaves main checked out. */
  addFeatureBranch(name = 'feature'): void {
    this.git('checkout', '-q', '-b', name)
    this.commitFile('feature.txt', 'feature\n', `Add feature.txt on ${name}`)
    this.git('checkout', '-q', 'main')
    this.commitFile('main.txt', 'main\n', 'Add main.txt')
  }

  /**
   * Adds a remote called `origin` whose remote-tracking branches point at the
   * given local branches, without anything to fetch from or push to.
   */
  addFakeRemote(url: string, branches: string[]): void {
    this.git('remote', 'add', 'origin', url)
    for (const branch of branches) {
      this.git('update-ref', `refs/remotes/origin/${branch}`, branch)
    }
  }

  /**
   * Gives the repo a real `origin` (a bare repository beside it) with an open
   * pull request `number` from `branch`: the branch with one commit adding
   * `pr.txt`, published as the branch and as refs/pull/<number>/head the way
   * GitHub does. The branch isn't kept locally.
   */
  addPullRequestRemote(number: number, branch: string): void {
    const remote = `${this.path}.origin.git`
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    this.git('remote', 'add', 'origin', remote)
    this.git('push', '-q', '-u', 'origin', 'main')
    this.git('checkout', '-q', '-b', branch)
    this.commitFile('pr.txt', 'from the pull request\n', `Add pr.txt on ${branch}`)
    this.git('push', '-q', 'origin', `HEAD:refs/heads/${branch}`, `HEAD:refs/pull/${number}/head`)
    this.git('checkout', '-q', 'main')
    this.git('branch', '-q', '-D', branch)
    this.git('update-ref', '-d', `refs/remotes/origin/${branch}`)
  }

  /** Adds `count` empty commits on top of main, "Bulk commit 1" (oldest) to "Bulk commit <count>", in one fast-import. */
  addManyCommits(count: number): void {
    const head = this.git('rev-parse', 'HEAD').trim()
    const start = Math.floor(Date.now() / 1000) - count * 60
    let stream = ''
    for (let i = 1; i <= count; i++) {
      const message = `Bulk commit ${i}\n`
      stream += `commit refs/heads/main\n`
      stream += `committer E2E Tester <e2e@example.com> ${start + i * 60} +0000\n`
      stream += `data ${Buffer.byteLength(message)}\n${message}`
      if (i === 1) stream += `from ${head}\n`
      stream += '\n'
    }
    execFileSync('git', ['fast-import', '--quiet'], { cwd: this.path, input: stream })
    this.git('reset', '-q', '--hard', 'main')
  }

  readFile(relativePath: string): string {
    return readFileSync(join(this.path, relativePath), 'utf8')
  }

  /**
   * Like readFile, but null while the file is missing. Git replaces a file by
   * deleting and rewriting it, so poll with this while the app changes it.
   */
  readFileIfPresent(relativePath: string): string | null {
    try {
      return this.readFile(relativePath)
    } catch {
      return null
    }
  }

  git(...args: string[]): string {
    return execFileSync('git', args, { cwd: this.path, env: { ...process.env, ...GIT_IDENTITY }, encoding: 'utf8' })
  }

  remove(): void {
    // Retried: a git command the app started may still be writing to it.
    rmSync(this.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    rmSync(`${this.path}.origin.git`, { recursive: true, force: true })
  }
}
