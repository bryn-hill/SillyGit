import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

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

  writeFile(relativePath: string, content: string): void {
    writeFileSync(join(this.path, relativePath), content)
  }

  commitFile(relativePath: string, content: string, message: string): void {
    this.writeFile(relativePath, content)
    this.git('add', relativePath)
    this.git('commit', '-q', '-m', message)
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

  readFile(relativePath: string): string {
    return readFileSync(join(this.path, relativePath), 'utf8')
  }

  git(...args: string[]): string {
    return execFileSync('git', args, { cwd: this.path, env: { ...process.env, ...GIT_IDENTITY }, encoding: 'utf8' })
  }

  remove(): void {
    rmSync(this.path, { recursive: true, force: true })
  }
}
