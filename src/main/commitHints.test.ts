import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as git from './git'

let dir: string

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function commit(message: string, email = 'ada@example.com'): void {
  run('-c', `user.email=${email}`, 'commit', '-q', '--allow-empty', '--no-gpg-sign', '-m', message)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-hints-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', 'Ada Lovelace')
  run('config', 'user.email', 'ada@example.com')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('getCommitHints', () => {
  it('is empty for a repo with no commits or template', async () => {
    expect(await git.getCommitHints(dir)).toEqual({ template: null, recent: [], scopes: [], types: [] })
  })

  it('reads commit.template relative to the repo, without comments', async () => {
    writeFileSync(join(dir, '.gitmessage'), '# What changed?\nTicket: \n')
    run('config', 'commit.template', '.gitmessage')
    expect((await git.getCommitHints(dir)).template).toBe('Ticket:')
  })

  it('ignores a template file that is missing', async () => {
    run('config', 'commit.template', 'nope.txt')
    expect((await git.getCommitHints(dir)).template).toBeNull()
  })

  it("lists the user's own recent messages and learns scopes from everyone's", async () => {
    commit('fix(ui): first')
    commit('feat(git): someone else', 'bob@example.com')
    commit('feat(ui): second\n\nWith a body')
    const hints = await git.getCommitHints(dir)
    expect(hints.recent).toEqual(['feat(ui): second\n\nWith a body', 'fix(ui): first'])
    expect(hints.scopes).toEqual(['ui', 'git'])
    expect(hints.types).toEqual(['feat', 'fix'])
  })
})
