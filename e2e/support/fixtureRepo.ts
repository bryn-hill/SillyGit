import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

  git(...args: string[]): string {
    return execFileSync('git', args, { cwd: this.path, env: { ...process.env, ...GIT_IDENTITY }, encoding: 'utf8' })
  }

  remove(): void {
    rmSync(this.path, { recursive: true, force: true })
  }
}
