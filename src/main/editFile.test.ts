import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, chmodSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readEditableFile, resolveInRepo, writeEditableFile } from './editFile'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-edit-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('resolveInRepo', () => {
  it('refuses paths outside the repo or inside .git', () => {
    expect(() => resolveInRepo(dir, '../evil.txt')).toThrow(/outside the repository/)
    expect(() => resolveInRepo(dir, '/etc/passwd')).toThrow(/outside the repository/)
    expect(() => resolveInRepo(dir, '.git/config')).toThrow(/inside .git/)
    expect(resolveInRepo(dir, 'src/a.ts')).toBe(join(dir, 'src/a.ts'))
  })
})

describe('readEditableFile', () => {
  it('reads text, and flags binary and missing files', async () => {
    writeFileSync(join(dir, 'a.txt'), 'hello\n')
    writeFileSync(join(dir, 'b.bin'), Buffer.from([1, 0, 2]))
    expect(await readEditableFile(dir, 'a.txt')).toMatchObject({ kind: 'text', content: 'hello\n' })
    expect(await readEditableFile(dir, 'b.bin')).toMatchObject({ kind: 'binary', size: 3 })
    expect(await readEditableFile(dir, 'gone.txt')).toMatchObject({ kind: 'missing' })
  })

  it('refuses directories', async () => {
    mkdirSync(join(dir, 'sub'))
    await expect(readEditableFile(dir, 'sub')).rejects.toThrow(/not a file/)
  })
})

describe('writeEditableFile', () => {
  it('overwrites in place and keeps the file mode', async () => {
    const file = join(dir, 'run.sh')
    writeFileSync(file, 'echo 1\n')
    chmodSync(file, 0o755)
    await writeEditableFile(dir, 'run.sh', 'echo 2\n')
    expect(readFileSync(file, 'utf-8')).toBe('echo 2\n')
    expect(statSync(file).mode & 0o777).toBe(0o755)
  })
})
