import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installCommand, launchPaths, resolveLaunchPath } from './launcher'
import { posixScript, windowsScript } from '../shared/launcher'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sillygit-launcher-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('launchPaths', () => {
  it('takes folders after the executable of a packaged app', () => {
    expect(launchPaths(['/Applications/SillyGit.app/Contents/MacOS/SillyGit', '.'], '/code/api', false)).toEqual([
      '/code/api'
    ])
  })

  it('skips the app folder when Electron runs a checkout', () => {
    expect(launchPaths(['/x/electron', '/x/sillygit', '../web'], '/code/api', true)).toEqual(['/code/web'])
    expect(launchPaths(['/x/electron', '.'], '/code/api', true)).toEqual([])
  })

  it('ignores flags, including the ones Chromium adds', () => {
    const argv = ['SillyGit', '--allow-file-access-from-files', '/code/api', '--user-data-dir=/tmp/u', '-psn_0_1']
    expect(launchPaths(argv, '/', false)).toEqual(['/code/api'])
  })
})

describe('resolveLaunchPath', () => {
  it('opens the top of the repository for a folder or file inside it', async () => {
    const repo = join(root, 'api')
    mkdirSync(join(repo, 'src'), { recursive: true })
    writeFileSync(join(repo, 'src', 'a.ts'), '')
    execFileSync('git', ['init', '-q', repo])
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' }).trim()
    expect(await resolveLaunchPath(join(repo, 'src'))).toEqual({ path: top })
    expect(await resolveLaunchPath(join(repo, 'src', 'a.ts'))).toEqual({ path: top })
  })

  it('passes on a folder outside any repository', async () => {
    expect(await resolveLaunchPath(root)).toEqual({ path: root })
  })

  it('says when there is nothing there', async () => {
    const missing = join(root, 'nope')
    expect((await resolveLaunchPath(missing)).error).toContain(missing)
  })
})

describe('scripts', () => {
  it('quote the program for the shell and run it in the background', () => {
    const script = posixScript({ program: "/Apps/Silly Git's/SillyGit", args: ['/src/silly git'] })
    expect(script).toContain(`nohup '/Apps/Silly Git'\\''s/SillyGit' '/src/silly git' "$@" >/dev/null 2>&1 &`)
    expect(script.startsWith('#!/bin/sh\n')).toBe(true)
  })

  it('start the app from cmd on Windows', () => {
    expect(windowsScript({ program: 'C:\\Program Files\\SillyGit\\SillyGit.exe', args: [] })).toContain(
      'start "" "C:\\Program Files\\SillyGit\\SillyGit.exe" %*'
    )
  })
})

describe('installCommand', () => {
  const command = { program: '/opt/SillyGit/sillygit', args: [] }

  it('links the script into ~/.local/bin on Linux', async () => {
    const binDir = join(root, 'userData', 'bin')
    const home = join(root, 'home')
    const result = await installCommand({ platform: 'linux', command, binDir, home, pathEnv: '/usr/bin' })
    const link = join(home, '.local', 'bin', 'sillygit')
    expect(result.installedAt).toBe(link)
    expect(result.note).toContain('PATH')
    expect(readlinkSync(link)).toBe(join(binDir, 'sillygit'))
    expect(readFileSync(link, 'utf8')).toContain("'/opt/SillyGit/sillygit'")
    expect(statSync(link).mode & 0o111).not.toBe(0)
    // Again, say after SillyGit moved: the script is rewritten in place.
    const moved = await installCommand({
      platform: 'linux',
      command: { program: '/new/sillygit', args: [] },
      binDir,
      home,
      pathEnv: join(home, '.local', 'bin')
    })
    expect(moved.note).toBeUndefined()
    expect(readFileSync(link, 'utf8')).toContain("'/new/sillygit'")
  })

  it("won't overwrite another program's sillygit", async () => {
    const home = join(root, 'home')
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    writeFileSync(join(home, '.local', 'bin', 'sillygit'), 'something else')
    await expect(installCommand({ platform: 'linux', command, binDir: join(root, 'bin'), home })).rejects.toThrow(
      "isn't SillyGit's"
    )
  })

  it('replaces a link from an earlier install elsewhere', async () => {
    const home = join(root, 'home')
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    symlinkSync('/old/SillyGit/bin/sillygit', join(home, '.local', 'bin', 'sillygit'))
    const binDir = join(root, 'bin')
    await installCommand({ platform: 'linux', command, binDir, home })
    expect(readlinkSync(join(home, '.local', 'bin', 'sillygit'))).toBe(join(binDir, 'sillygit'))
  })

  it('writes sillygit.cmd and adds its folder to the PATH on Windows', async () => {
    const binDir = join(root, 'bin')
    const added: string[] = []
    const result = await installCommand({
      platform: 'win32',
      command,
      binDir,
      addToUserPath: async (dir) => void added.push(dir)
    })
    expect(result.installedAt).toBe(join(binDir, 'sillygit.cmd'))
    expect(added).toEqual([binDir])
  })
})
