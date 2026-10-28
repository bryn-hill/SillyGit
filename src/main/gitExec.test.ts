import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { runGit } from './gitExec'

let repo: string

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('runGit', () => {
  it('runs commands that change a repo one at a time, so they never meet on index.lock', async () => {
    repo = mkdtempSync(join(tmpdir(), 'sillygit-gitexec-'))
    execFileSync('git', ['init', '-q'], { cwd: repo })
    const files = Array.from({ length: 30 }, (_, i) => `file-${i}.txt`)
    for (const file of files) writeFileSync(join(repo, file), `${file}\n`)

    await Promise.all(files.map((file) => runGit(repo, ['add', '--', file])))

    expect(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').sort()).toEqual(
      [...files].sort()
    )
  })
})
