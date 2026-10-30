import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const editorSettings = vi.hoisted(() => ({ editor: null as string | null, customCommand: '' }))
vi.mock('./settings', () => ({ getEditorSettings: async () => editorSettings }))
// Look only on the test's PATH, not in Homebrew's or the user's bin folders,
// so editors installed on the machine running the tests don't show up.
vi.mock('./executables', async (importOriginal) => {
  const real = await importOriginal<typeof import('./executables')>()
  const searchPath = (): string[] => (process.env.PATH ?? '').split(':')
  const findExecutable = async (program: string): Promise<string | null> => {
    for (const dir of searchPath()) if (await real.isExecutable(join(dir, program))) return join(dir, program)
    return null
  }
  return { ...real, searchPath, findExecutable }
})

import { listEditors, openInEditor } from './editors'

let root: string
let bin: string
let repo: string
let savedPath: string | undefined
const platform = process.platform

/** A fake editor command that writes its arguments to <name>.args. */
function fakeEditor(name: string): void {
  const script = join(bin, name)
  writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(root, name)}.args"\n`)
  chmodSync(script, 0o755)
}

async function argsOf(name: string): Promise<string[]> {
  const file = join(root, `${name}.args`)
  await vi.waitFor(() => expect(existsSync(file)).toBe(true))
  return readFileSync(file, 'utf8').trimEnd().split('\n')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sillygit-editors-'))
  bin = join(root, 'bin')
  repo = join(root, 'repo')
  mkdirSync(bin)
  mkdirSync(repo)
  savedPath = process.env.PATH
  // Only the fake editors (and sh) are on PATH.
  process.env.PATH = `${bin}:/bin:/usr/bin`
  // Skip the macOS app bundle lookup, which would find the real /Applications.
  Object.defineProperty(process, 'platform', { value: 'linux' })
})

afterEach(() => {
  process.env.PATH = savedPath
  Object.defineProperty(process, 'platform', { value: platform })
  rmSync(root, { recursive: true, force: true })
  editorSettings.editor = null
  editorSettings.customCommand = ''
})

describe.skipIf(platform === 'win32')('editors', () => {
  it('lists the editors on PATH, in the presets order, and looks again on rescan', async () => {
    fakeEditor('zed')
    fakeEditor('code')
    expect((await listEditors(true)).map((e) => e.id)).toEqual(['vscode', 'zed'])
    fakeEditor('webstorm')
    expect((await listEditors()).map((e) => e.id)).toEqual(['vscode', 'zed'])
    expect((await listEditors(true)).map((e) => e.id)).toEqual(['vscode', 'zed', 'webstorm'])
  })

  it('opens the repo, or a file in the repo window', async () => {
    fakeEditor('code')
    await listEditors(true)
    await openInEditor(repo, 'vscode')
    expect(await argsOf('code')).toEqual([repo])
    rmSync(join(root, 'code.args'))
    await openInEditor(repo, 'vscode', 'src/a b.ts')
    expect(await argsOf('code')).toEqual([repo, '--goto', join(repo, 'src/a b.ts')])
  })

  it('runs a custom command', async () => {
    fakeEditor('myeditor')
    editorSettings.customCommand = 'myeditor --project $REPO $PATH'
    await openInEditor(repo, 'custom', 'x.txt')
    expect(await argsOf('myeditor')).toEqual(['--project', repo, join(repo, 'x.txt')])
  })

  it('refuses files outside the repo and editors that are not installed', async () => {
    fakeEditor('code')
    await listEditors(true)
    await expect(openInEditor(repo, 'vscode', '../secret')).rejects.toThrow(/not inside the repository/)
    await expect(openInEditor(repo, 'rider')).rejects.toThrow(/isn't installed/)
  })
})
