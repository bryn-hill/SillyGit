import { execFileSync } from 'child_process'
import { createServer, type Server } from 'http'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import * as git from './git'
import { gitConfigEnv, remoteEnv, setNetworkEnv } from './gitExec'
import { gitAuthHeader } from './providerApi'

// A fake git server that records the Authorization header of each request.
let server: Server
let port: number
const seen: (string | undefined)[] = []
let dir: string
const savedNoProxy = [process.env['NO_PROXY'], process.env['no_proxy']]

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(req.headers.authorization)
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
  // Make sure git talks to the fake server directly, not through a proxy.
  process.env['NO_PROXY'] = process.env['no_proxy'] = '127.0.0.1'
})

afterAll(() => {
  server.close()
  ;[process.env['NO_PROXY'], process.env['no_proxy']] = savedNoProxy
})

afterEach(() => {
  seen.length = 0
  setNetworkEnv(async () => ({}))
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function repoWithRemote(url: string): string {
  dir = mkdtempSync(join(tmpdir(), 'sillygit-auth-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['remote', 'add', 'origin', url], { cwd: dir })
  return dir
}

describe('gitConfigEnv', () => {
  it('numbers entries after any config already passed in the environment', () => {
    const env = gitConfigEnv([{ key: 'a.b', value: '1' }, { key: 'c.d', value: '2' }], { GIT_CONFIG_COUNT: '1' })
    expect(env).toEqual({
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_1: 'a.b',
      GIT_CONFIG_VALUE_1: '1',
      GIT_CONFIG_KEY_2: 'c.d',
      GIT_CONFIG_VALUE_2: '2'
    })
  })

  it('adds nothing without entries', () => {
    expect(gitConfigEnv([])).toEqual({})
  })
})

describe('tokens on fetch', () => {
  it('sends the token to its host, through the environment rather than the command line', async () => {
    const repo = repoWithRemote(`http://127.0.0.1:${port}/owner/repo.git`)
    setNetworkEnv(async () =>
      gitConfigEnv([{ key: `http.http://127.0.0.1:${port}/.extraHeader`, value: gitAuthHeader('octocat', 'tok123') }])
    )
    await expect(git.fetchAll(repo)).rejects.toThrow()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]).toBe(`Basic ${Buffer.from('octocat:tok123').toString('base64')}`)
  })

  it("doesn't send a token meant for another host", async () => {
    const repo = repoWithRemote(`http://127.0.0.1:${port}/owner/repo.git`)
    setNetworkEnv(async () =>
      gitConfigEnv([{ key: 'http.https://github.com/.extraHeader', value: gitAuthHeader('octocat', 'tok123') }])
    )
    await expect(git.fetchAll(repo)).rejects.toThrow()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((h) => h === undefined)).toBe(true)
  })

  it('still runs without prompting when looking up tokens fails', async () => {
    setNetworkEnv(async () => {
      throw new Error('keychain locked')
    })
    expect(await remoteEnv()).toEqual({ GIT_TERMINAL_PROMPT: '0' })
  })
})
