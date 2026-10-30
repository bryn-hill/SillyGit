import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as signing from './signing'
import { addSshKey } from './github'
import { setFetch } from './http'

const hasSshKeygen = (() => {
  try {
    execFileSync('ssh-keygen', ['-?'], { stdio: 'ignore' })
    return true
  } catch (err) {
    // ssh-keygen -? prints usage and exits 1; a missing program throws ENOENT.
    return (err as { code?: string }).code !== 'ENOENT'
  }
})()

let home: string
let repo: string
const saved: Record<string, string | undefined> = {}

function run(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sillygit-signing-home-'))
  repo = mkdtempSync(join(tmpdir(), 'sillygit-signing-repo-'))
  // A home of its own, so nothing here touches the real ~/.gitconfig or ~/.ssh.
  for (const k of ['HOME', 'USERPROFILE', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']) saved[k] = process.env[k]
  process.env.HOME = home
  process.env.USERPROFILE = home
  process.env.GIT_CONFIG_GLOBAL = join(home, '.gitconfig')
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  writeFileSync(join(home, '.gitconfig'), '[user]\n\tname = Ada Lovelace\n\temail = ada@example.com\n')
  run('init', '-q', '-b', 'main')
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  rmSync(home, { recursive: true, force: true })
  rmSync(repo, { recursive: true, force: true })
})

describe('signing settings', () => {
  it('reads and writes global and repository settings', async () => {
    let state = await signing.getSigningState(repo)
    expect(state.global).toEqual({ format: null, key: null, signCommits: null, signTags: null })
    expect(state.effective).toEqual({ format: 'openpgp', key: null, signCommits: false, signTags: false })
    expect(state.email).toBe('ada@example.com')

    state = await signing.setSigning('global', null, { format: 'ssh', key: '~/.ssh/id_ed25519', signCommits: true })
    expect(readFileSync(join(home, '.gitconfig'), 'utf8')).toMatch(/gpgsign = true/)
    expect(state.global).toMatchObject({ format: 'ssh', signCommits: true })

    state = await signing.setSigning('local', repo, { signCommits: false })
    expect(run('config', '--local', 'commit.gpgsign')).toBe('false')
    expect(state.local?.signCommits).toBe(false)
    expect(state.effective.signCommits).toBe(false)
    expect(state.effective.format).toBe('ssh')

    state = await signing.clearLocalSigning(repo)
    expect(state.local).toEqual({ format: null, key: null, signCommits: null, signTags: null })
    expect(state.effective.signCommits).toBe(true)

    state = await signing.setSigning('global', null, { key: null })
    expect(state.global.key).toBeNull()
  })

  it('needs a repository for repository settings', async () => {
    await expect(signing.setSigning('local', null, { signCommits: true })).rejects.toThrow(/Open a repository/)
  })
})

describe('SSH keys', () => {
  it('lists public keys in ~/.ssh and skips anything else', async () => {
    mkdirSync(join(home, '.ssh'))
    writeFileSync(join(home, '.ssh', 'id_ed25519.pub'), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA ada@example.com\n')
    writeFileSync(join(home, '.ssh', 'id_ed25519'), 'private')
    writeFileSync(join(home, '.ssh', 'broken.pub'), 'nope\n')
    const keys = await signing.listSshKeys()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({
      publicKeyPath: join(home, '.ssh', 'id_ed25519.pub'),
      privateKeyPath: join(home, '.ssh', 'id_ed25519'),
      type: 'ssh-ed25519',
      comment: 'ada@example.com'
    })
    await expect(signing.sshKeyAt(join(home, 'elsewhere.pub'))).rejects.toThrow(/isn’t in ~\/.ssh/)
  })

  it('refuses names that leave ~/.ssh', async () => {
    await expect(signing.generateSshKey('../escape', '', '')).rejects.toThrow(/letters, digits/)
  })

  it.skipIf(!hasSshKeygen)('generates a key, trusts it and signs a commit with it', async () => {
    const key = await signing.generateSshKey('id_test', 'ada@example.com', '')
    expect(key.type).toBe('ssh-ed25519')
    expect(key.fingerprint).toMatch(/^SHA256:/)
    if (process.platform !== 'win32') expect(statSync(key.privateKeyPath!).mode & 0o077).toBe(0)
    await expect(signing.generateSshKey('id_test', '', '')).rejects.toThrow(/already exists/)

    await signing.setSigning('global', null, { format: 'ssh', key: key.privateKeyPath })
    const file = await signing.trustSshKey(repo, key.publicKeyPath)
    expect(readFileSync(file, 'utf8')).toContain('ada@example.com namespaces="git" ssh-ed25519 ')
    expect((await signing.getSigningState(repo)).allowedSignersFile).toBe(file)
    // Trusting it again doesn't add a second line.
    await signing.trustSshKey(repo, key.publicKeyPath)
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1)

    expect(await signing.testSigning(repo)).toMatch(/SSH/)

    // A real commit is signed and verifies.
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    run('add', 'a.txt')
    run('commit', '-q', '-S', '-m', 'Signed')
    expect(run('log', '-1', '--format=%G?')).toBe('G')
  })

  it('reports why signing failed', async () => {
    await signing.setSigning('global', null, { format: 'ssh', key: join(home, 'missing') })
    await expect(signing.testSigning(repo)).rejects.toThrow(/Signing failed/)
    expect(existsSync(join(home, '.ssh', 'allowed_signers'))).toBe(false)
  })
})

describe('addSshKey', () => {
  afterEach(() => setFetch((url, init) => fetch(url, init)))
  const creds = { provider: 'github' as const, host: 'github.com', token: 't' }

  it('posts authentication and signing keys to their endpoints', async () => {
    const calls: { url: string; body: unknown }[] = []
    setFetch(async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) })
      return new Response('{}', { status: 201 })
    })
    await addSshKey(creds, 'Laptop', 'ssh-ed25519 AAAA', 'authentication')
    await addSshKey({ ...creds, host: 'ghe.example.com' }, 'Laptop', 'ssh-ed25519 AAAA', 'signing')
    expect(calls).toEqual([
      { url: 'https://api.github.com/user/keys', body: { title: 'Laptop', key: 'ssh-ed25519 AAAA' } },
      { url: 'https://ghe.example.com/api/v3/user/ssh_signing_keys', body: { title: 'Laptop', key: 'ssh-ed25519 AAAA' } }
    ])
  })

  it('names the missing scope when the token can’t add keys', async () => {
    setFetch(async () => new Response(JSON.stringify({ message: 'Resource not accessible' }), { status: 403 }))
    await expect(addSshKey(creds, 'x', 'ssh-ed25519 AAAA', 'signing')).rejects.toThrow(/write:ssh_signing_key/)
  })
})
