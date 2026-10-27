import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerifiedAccount } from './providerApi'

// A stand-in for Electron's safeStorage: "encrypts" by reversing and tagging,
// so tests can see that the file never holds the token as typed.
const env = vi.hoisted(() => ({
  userData: '',
  available: true,
  backend: 'gnome_libsecret',
  verify: null as unknown as (creds: { provider: string; host: string; token: string; username?: string }) => Promise<VerifiedAccount>
}))

vi.mock('electron', () => ({
  app: { getPath: () => env.userData },
  safeStorage: {
    isEncryptionAvailable: () => env.available,
    getSelectedStorageBackend: () => env.backend,
    encryptString: (text: string) => Buffer.from(`enc:${[...text].reverse().join('')}`),
    decryptString: (buf: Buffer) => {
      const text = buf.toString()
      if (!text.startsWith('enc:')) throw new Error('cannot decrypt')
      return [...text.slice(4)].reverse().join('')
    }
  }
}))

vi.mock('./providerApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./providerApi')>()),
  verifyAccount: (creds: Parameters<typeof env.verify>[0]) => env.verify(creds)
}))

vi.mock('./avatars', () => ({
  downloadAsDataUrl: async (url: string) => (url.includes('broken') ? Promise.reject(new Error('404')) : `data:image/png;base64,${url}`)
}))

// The module caches the file, so every test gets a fresh copy.
let accounts: typeof import('./accounts')

const verified = (username: string, extra: Partial<VerifiedAccount> = {}): VerifiedAccount => ({
  username,
  displayName: username.toUpperCase(),
  avatarUrl: null,
  emails: [`${username}@example.com`],
  ...extra
})

const accountsFile = (): string => join(env.userData, 'sillygit-accounts.json')

beforeEach(async () => {
  env.userData = mkdtempSync(join(tmpdir(), 'sillygit-accounts-'))
  env.available = true
  env.backend = 'gnome_libsecret'
  env.verify = async (creds) => verified(creds.token.startsWith('grace') ? 'grace' : 'ada')
  vi.resetModules()
  accounts = await import('./accounts')
})

afterEach(() => rmSync(env.userData, { recursive: true, force: true }))

describe('addAccount', () => {
  it('saves a verified account with its token encrypted and the file owner-only', async () => {
    const account = await accounts.addAccount({ provider: 'github', host: '', token: '  ada-secret  ' })
    expect(account).toMatchObject({ provider: 'github', host: 'github.com', username: 'ada', displayName: 'ADA' })
    expect(account).not.toHaveProperty('encryptedToken')

    const text = readFileSync(accountsFile(), 'utf8')
    expect(text).not.toContain('ada-secret')
    if (process.platform !== 'win32') expect(statSync(accountsFile()).mode & 0o777).toBe(0o600)

    expect(await accounts.listAccounts()).toEqual([account])
    const found = await accounts.credentialsFor('github.com', 'github')
    expect(found?.creds).toEqual({ provider: 'github', host: 'github.com', token: 'ada-secret', username: undefined })
  })

  it('normalizes an editable host and pins Bitbucket to bitbucket.org', async () => {
    const gitlab = await accounts.addAccount({ provider: 'gitlab', host: 'https://GitLab.Example.com/', token: 't' })
    expect(gitlab.host).toBe('gitlab.example.com')
    const bitbucket = await accounts.addAccount({
      provider: 'bitbucket',
      host: 'elsewhere.example.com',
      username: 'ada@example.com',
      token: 't'
    })
    expect(bitbucket.host).toBe('bitbucket.org')
  })

  it('replaces an earlier token for the same login, keeping other accounts', async () => {
    await accounts.addAccount({ provider: 'github', host: 'github.com', token: 'ada-1' })
    await accounts.addAccount({ provider: 'github', host: 'github.com', token: 'grace-1' })
    await accounts.addAccount({ provider: 'github', host: 'github.com', token: 'ada-2' })
    const list = await accounts.listAccounts()
    expect(list.map((a) => a.username)).toEqual(['grace', 'ada'])
    const all = await accounts.accountsWithCredentials('github')
    expect(all.find((a) => a.account.username === 'ada')?.creds.token).toBe('ada-2')
  })

  it('keeps the avatar as a data URL, and carries on without one when it fails to download', async () => {
    env.verify = async () => verified('ada', { avatarUrl: 'https://img/ada' })
    expect((await accounts.addAccount({ provider: 'github', host: '', token: 't' })).avatar).toBe(
      'data:image/png;base64,https://img/ada'
    )
    env.verify = async () => verified('grace', { avatarUrl: 'https://img/broken' })
    expect((await accounts.addAccount({ provider: 'github', host: '', token: 't' })).avatar).toBeNull()
  })

  it('refuses incomplete input before asking the service', async () => {
    const verify = vi.fn(env.verify)
    env.verify = verify
    await expect(accounts.addAccount({ provider: 'github', host: '', token: '   ' })).rejects.toThrow(/Paste a token/)
    await expect(accounts.addAccount({ provider: 'gitea', host: '', token: 't' })).rejects.toThrow(/server's address/)
    await expect(accounts.addAccount({ provider: 'bitbucket', host: '', token: 't' })).rejects.toThrow(/email of your Bitbucket/)
    await expect(accounts.addAccount({ provider: 'nope' as 'github', host: '', token: 't' })).rejects.toThrow(/Unknown service/)
    expect(verify).not.toHaveBeenCalled()
  })

  it('says which service rejected the token', async () => {
    env.verify = async () => {
      throw new Error('401 Bad credentials')
    }
    await expect(accounts.addAccount({ provider: 'gitlab', host: '', token: 't' })).rejects.toThrow(
      "GitLab didn't accept the token (401 Bad credentials)."
    )
    expect(await accounts.listAccounts()).toEqual([])
  })

  it('refuses to save tokens without secure storage', async () => {
    env.available = false
    await expect(accounts.addAccount({ provider: 'github', host: '', token: 't' })).rejects.toThrow(/no secure storage/)
    env.available = true
    env.backend = 'basic_text'
    if (process.platform === 'linux') {
      expect(accounts.encryptionProblem()).toMatch(/No keyring/)
    } else {
      expect(accounts.encryptionProblem()).toBeNull()
    }
  })
})

describe('reading accounts', () => {
  it('copes with a missing or corrupt file', async () => {
    expect(await accounts.listAccounts()).toEqual([])
    writeFileSync(accountsFile(), '{"accounts": "nope"}')
    vi.resetModules()
    accounts = await import('./accounts')
    expect(await accounts.listAccounts()).toEqual([])
  })

  it('skips tokens it cannot decrypt, e.g. from another machine', async () => {
    await accounts.addAccount({ provider: 'github', host: 'github.com', token: 'ada-secret' })
    const file = JSON.parse(readFileSync(accountsFile(), 'utf8'))
    file.accounts[0].encryptedToken = Buffer.from('garbage').toString('base64')
    writeFileSync(accountsFile(), JSON.stringify(file))
    vi.resetModules()
    accounts = await import('./accounts')

    expect(await accounts.listAccounts()).toHaveLength(1)
    expect(await accounts.credentialsFor('github.com')).toBeNull()
    expect(await accounts.accountsWithCredentials('github')).toEqual([])
    expect(await accounts.gitAuthEnv()).toEqual({})
  })

  it('finds credentials by host and, when given, provider', async () => {
    await accounts.addAccount({ provider: 'gitea', host: 'git.example.com', token: 'ada-t' })
    expect(await accounts.credentialsFor('git.example.com')).not.toBeNull()
    expect(await accounts.credentialsFor('git.example.com', 'github')).toBeNull()
    expect(await accounts.credentialsFor('other.example.com')).toBeNull()
  })

  it('removes an account by id', async () => {
    const ada = await accounts.addAccount({ provider: 'github', host: '', token: 'ada' })
    await accounts.addAccount({ provider: 'github', host: '', token: 'grace' })
    expect((await accounts.removeAccount(ada.id)).map((a) => a.username)).toEqual(['grace'])
    vi.resetModules()
    accounts = await import('./accounts')
    expect((await accounts.listAccounts()).map((a) => a.username)).toEqual(['grace'])
  })
})

describe('gitAuthEnv', () => {
  it('sends one token per host through git config in the environment', async () => {
    await accounts.addAccount({ provider: 'github', host: 'github.com', token: 'ada-t' })
    await accounts.addAccount({ provider: 'github', host: 'github.com', token: 'grace-t' })
    await accounts.addAccount({ provider: 'bitbucket', host: '', username: 'ada@example.com', token: 'bb-t' })
    const env = await accounts.gitAuthEnv()
    expect(env['GIT_CONFIG_COUNT']).toBe(String(Number(process.env['GIT_CONFIG_COUNT'] ?? 0) + 2))
    const keys = Object.entries(env).filter(([k]) => k.startsWith('GIT_CONFIG_KEY_')).map(([, v]) => v)
    expect(keys).toEqual(['http.https://github.com/.extraHeader', 'http.https://bitbucket.org/.extraHeader'])

    const values = Object.entries(env).filter(([k]) => k.startsWith('GIT_CONFIG_VALUE_')).map(([, v]) => v)
    const decoded = values.map((v) => Buffer.from(v.replace('Authorization: Basic ', ''), 'base64').toString())
    // The first account for a host wins, and Bitbucket API tokens use Atlassian's fixed username.
    expect(decoded).toEqual(['ada:ada-t', 'x-bitbucket-api-token-auth:bb-t'])
  })
})
