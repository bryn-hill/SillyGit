import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderAccount } from '../shared/accounts'
import type { Credentials } from './providerApi'

// Signed-in accounts come from a fake; each host's API is a fake fetch.
const fake = vi.hoisted(() => ({ accounts: [] as { account: ProviderAccount; creds: Credentials | null }[] }))

vi.mock('./accounts', () => ({
  listAccounts: async () => fake.accounts.map((a) => a.account),
  credentialsById: async (id: string) => {
    const found = fake.accounts.find((a) => a.account.id === id)
    return found?.creds ? { account: found.account, creds: found.creds } : null
  }
}))

import { setFetch } from './http'
import { createRepo, listHostedRepos, ownersFor, publishRepo } from './hostedRepos'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

let calls: Call[] = []
let respond: (call: Call) => { status?: number; json: unknown } = () => ({ json: [] })

function account(id: string, provider: ProviderAccount['provider'], host: string, extra: Partial<ProviderAccount> = {}): ProviderAccount {
  return { id, provider, host, username: 'ada', displayName: 'Ada', avatar: null, emails: [], addedAt: '', ...extra }
}

const github = account('gh', 'github', 'github.com')
const githubCreds: Credentials = { provider: 'github', host: 'github.com', token: 'gh-token' }

beforeEach(() => {
  calls = []
  respond = () => ({ json: [] })
  fake.accounts = []
  setFetch(async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    }
    calls.push(call)
    const { status = 200, json } = respond(call)
    return new Response(JSON.stringify(json), {
      status,
      statusText: status < 300 ? 'OK' : 'Error',
      headers: { 'content-type': 'application/json' }
    })
  })
})

const ghRepo = (name: string, pushed: string, extra: object = {}): object => ({
  full_name: `ada/${name}`,
  description: null,
  private: false,
  clone_url: `https://github.com/ada/${name}.git`,
  ssh_url: `git@github.com:ada/${name}.git`,
  html_url: `https://github.com/ada/${name}`,
  pushed_at: pushed,
  ...extra
})

describe('listHostedRepos', () => {
  it('lists GitHub repositories with the token, newest first, reading every page', async () => {
    fake.accounts = [{ account: github, creds: githubCreds }]
    const firstPage = Array.from({ length: 100 }, (_, i) => ghRepo(`r${i}`, '2026-01-01T00:00:00Z'))
    respond = (call) =>
      call.url.includes('page=1&')
        ? { json: firstPage }
        : { json: [ghRepo('newest', '2026-10-30T00:00:00Z', { private: true, description: 'The app' })] }
    const list = await listHostedRepos()
    expect(list.errors).toEqual([])
    expect(list.repos).toHaveLength(101)
    expect(list.repos[0]).toEqual({
      accountId: 'gh',
      provider: 'github',
      host: 'github.com',
      fullName: 'ada/newest',
      description: 'The app',
      private: true,
      cloneUrl: 'https://github.com/ada/newest.git',
      sshUrl: 'git@github.com:ada/newest.git',
      webUrl: 'https://github.com/ada/newest',
      updatedAt: '2026-10-30T00:00:00Z'
    })
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.github.com/user/repos?per_page=100&page=1&sort=pushed&affiliation=owner,collaborator,organization_member',
      'https://api.github.com/user/repos?per_page=100&page=2&sort=pushed&affiliation=owner,collaborator,organization_member'
    ])
    expect(calls[0].headers['Authorization']).toBe('Bearer gh-token')
  })

  it('reads GitLab projects, Bitbucket workspaces and Azure DevOps repositories', async () => {
    fake.accounts = [
      { account: account('gl', 'gitlab', 'gitlab.com'), creds: { provider: 'gitlab', host: 'gitlab.com', token: 'gl' } },
      {
        account: account('bb', 'bitbucket', 'bitbucket.org'),
        creds: { provider: 'bitbucket', host: 'bitbucket.org', token: 'bb', username: 'ada@example.com' }
      },
      {
        account: account('az', 'azure', 'dev.azure.com', { organization: 'contoso' }),
        creds: { provider: 'azure', host: 'dev.azure.com', token: 'az', organization: 'contoso' }
      }
    ]
    respond = (call) => {
      if (call.url.startsWith('https://gitlab.com/api/v4/projects'))
        return {
          json: [
            {
              path_with_namespace: 'team/api',
              description: 'API',
              visibility: 'internal',
              http_url_to_repo: 'https://gitlab.com/team/api.git',
              ssh_url_to_repo: 'git@gitlab.com:team/api.git',
              web_url: 'https://gitlab.com/team/api',
              last_activity_at: '2026-10-29T00:00:00Z'
            }
          ]
        }
      if (call.url.startsWith('https://api.bitbucket.org/2.0/user/workspaces'))
        return { json: { values: [{ workspace: { slug: 'acme', name: 'Acme' } }] } }
      if (call.url.startsWith('https://api.bitbucket.org/2.0/repositories/acme'))
        return {
          json: {
            values: [
              {
                full_name: 'acme/site',
                is_private: true,
                updated_on: '2026-10-28T00:00:00Z',
                links: {
                  clone: [
                    { name: 'https', href: 'https://ada@bitbucket.org/acme/site.git' },
                    { name: 'ssh', href: 'git@bitbucket.org:acme/site.git' }
                  ],
                  html: { href: 'https://bitbucket.org/acme/site' }
                }
              }
            ]
          }
        }
      if (call.url.startsWith('https://dev.azure.com/contoso/_apis/git/repositories'))
        return {
          json: {
            value: [
              {
                id: '1',
                name: 'web',
                project: { id: 'p', name: 'Web' },
                remoteUrl: 'https://contoso@dev.azure.com/contoso/Web/_git/web',
                webUrl: 'https://dev.azure.com/contoso/Web/_git/web'
              },
              { id: '2', name: 'old', project: { id: 'p', name: 'Web' }, remoteUrl: 'x', isDisabled: true }
            ]
          }
        }
      return { status: 404, json: {} }
    }
    const list = await listHostedRepos()
    expect(list.errors).toEqual([])
    expect(list.repos.map((r) => [r.fullName, r.cloneUrl, r.private])).toEqual([
      ['team/api', 'https://gitlab.com/team/api.git', true],
      ['acme/site', 'https://bitbucket.org/acme/site.git', true],
      ['Web/web', 'https://dev.azure.com/contoso/Web/_git/web', true]
    ])
  })

  it('keeps listing the other accounts when one fails, and leaves Jira out', async () => {
    fake.accounts = [
      { account: github, creds: githubCreds },
      { account: account('gl', 'gitlab', 'gitlab.com'), creds: { provider: 'gitlab', host: 'gitlab.com', token: 'x' } },
      { account: account('ji', 'jira', 'acme.atlassian.net'), creds: { provider: 'jira', host: 'acme.atlassian.net', token: 'j' } },
      { account: account('lost', 'gitea', 'git.example.com'), creds: null }
    ]
    respond = (call) =>
      call.url.includes('gitlab.com')
        ? { status: 401, json: { message: '401 Unauthorized' } }
        : { json: [ghRepo('app', '2026-10-30T00:00:00Z')] }
    const list = await listHostedRepos()
    expect(list.repos.map((r) => r.fullName)).toEqual(['ada/app'])
    expect(list.errors.map((e) => e.accountId)).toEqual(['gl', 'lost'])
    expect(list.errors[0].message).toMatch(/^401/)
    expect(calls.some((c) => c.url.includes('atlassian'))).toBe(false)
  })
})

describe('ownersFor', () => {
  it('offers the GitHub user, then their organizations', async () => {
    respond = () => ({ json: [{ login: 'acme' }] })
    expect(await ownersFor(github, githubCreds)).toEqual([
      { id: '', label: 'ada (you)' },
      { id: 'org:acme', label: 'acme' }
    ])
  })

  it('offers GitLab namespaces, the user\'s own first', async () => {
    respond = () => ({
      json: [
        { id: 7, full_path: 'team', kind: 'group' },
        { id: 3, full_path: 'ada', kind: 'user' }
      ]
    })
    const creds: Credentials = { provider: 'gitlab', host: 'gitlab.com', token: 'x' }
    expect(await ownersFor(account('gl', 'gitlab', 'gitlab.com'), creds)).toEqual([
      { id: '3', label: 'ada (you)' },
      { id: '7', label: 'team' }
    ])
  })

  it('falls back to the older Bitbucket workspaces list', async () => {
    respond = (call) =>
      call.url.includes('/user/workspaces')
        ? { status: 410, json: {} }
        : { json: { values: [{ slug: 'acme', name: 'Acme' }] } }
    const creds: Credentials = { provider: 'bitbucket', host: 'bitbucket.org', token: 'x', username: 'ada@example.com' }
    expect(await ownersFor(account('bb', 'bitbucket', 'bitbucket.org'), creds)).toEqual([{ id: 'acme', label: 'Acme' }])
  })
})

describe('createRepo', () => {
  it('creates a private GitHub repository in an organization', async () => {
    respond = () => ({ status: 201, json: ghRepo('app', '') })
    expect(await createRepo(githubCreds, { owner: 'org:acme', name: 'app', description: 'd', private: true })).toEqual({
      cloneUrl: 'https://github.com/ada/app.git',
      webUrl: 'https://github.com/ada/app'
    })
    expect(calls).toMatchObject([
      { url: 'https://api.github.com/orgs/acme/repos', method: 'POST', body: { name: 'app', description: 'd', private: true } }
    ])
  })

  it('creates a GitLab project in a namespace', async () => {
    respond = () => ({ status: 201, json: { http_url_to_repo: 'https://gitlab.com/team/app.git', web_url: 'https://gitlab.com/team/app' } })
    await createRepo({ provider: 'gitlab', host: 'gitlab.com', token: 'x' }, { owner: '7', name: 'app', description: '', private: false })
    expect(calls[0]).toMatchObject({
      url: 'https://gitlab.com/api/v4/projects',
      body: { name: 'app', path: 'app', visibility: 'public', namespace_id: 7 }
    })
  })

  it('creates a Bitbucket repository with a lower-case slug', async () => {
    respond = () => ({
      json: { full_name: 'acme/app', is_private: true, links: { clone: [{ name: 'https', href: 'https://ada@bitbucket.org/acme/app.git' }] } }
    })
    const created = await createRepo(
      { provider: 'bitbucket', host: 'bitbucket.org', token: 'x', username: 'ada@example.com' },
      { owner: 'acme', name: 'App', description: '', private: true }
    )
    expect(created.cloneUrl).toBe('https://bitbucket.org/acme/app.git')
    expect(calls[0]).toMatchObject({ url: 'https://api.bitbucket.org/2.0/repositories/acme/app', body: { scm: 'git', is_private: true } })
  })

  it('creates an Azure DevOps repository in a project', async () => {
    respond = () => ({ status: 201, json: { remoteUrl: 'https://contoso@dev.azure.com/contoso/Web/_git/app', webUrl: 'w' } })
    const created = await createRepo(
      { provider: 'azure', host: 'dev.azure.com', token: 'x', organization: 'contoso' },
      { owner: 'proj-id', name: 'app', description: '', private: true }
    )
    expect(created).toEqual({ cloneUrl: 'https://dev.azure.com/contoso/Web/_git/app', webUrl: 'w' })
    expect(calls[0].url).toBe('https://dev.azure.com/contoso/proj-id/_apis/git/repositories?api-version=7.1')
    expect(calls[0].body).toEqual({ name: 'app', project: { id: 'proj-id' } })
  })
})

describe('publishRepo', () => {
  let dir: string
  let remoteDir: string
  const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const input = { accountId: 'gh', owner: '', name: 'app', description: '', private: true }

  beforeEach(() => {
    fake.accounts = [{ account: github, creds: githubCreds }]
    dir = mkdtempSync(join(tmpdir(), 'sillygit-publish-'))
    remoteDir = mkdtempSync(join(tmpdir(), 'sillygit-publish-remote-'))
    git(remoteDir, 'init', '-q', '--bare', '-b', 'main')
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.name', 'Ada Lovelace')
    git(dir, 'config', 'user.email', 'ada@example.com')
    // The "created" GitHub URL really goes to the local bare repo.
    git(dir, 'config', `url.${remoteDir}.insteadOf`, 'https://github.com/ada/app.git')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(remoteDir, { recursive: true, force: true })
  })

  const commit = (): void => {
    writeFileSync(join(dir, 'a.txt'), 'a\n')
    git(dir, 'add', 'a.txt')
    git(dir, 'commit', '-q', '-m', 'First')
  }

  it('creates the repository, adds it as origin and pushes the branch, tracking it', async () => {
    commit()
    respond = () => ({ status: 201, json: ghRepo('app', '') })
    expect(await publishRepo(dir, input)).toEqual({
      remote: 'origin',
      branch: 'main',
      cloneUrl: 'https://github.com/ada/app.git',
      webUrl: 'https://github.com/ada/app'
    })
    expect(calls[0]).toMatchObject({ url: 'https://api.github.com/user/repos', method: 'POST' })
    expect(git(dir, 'config', 'remote.origin.url')).toBe('https://github.com/ada/app.git')
    expect(git(remoteDir, 'rev-parse', 'main')).toBe(git(dir, 'rev-parse', 'HEAD'))
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'main@{upstream}')).toBe('origin/main')
  })

  it('refuses before creating anything when there is nothing to push', async () => {
    await expect(publishRepo(dir, input)).rejects.toThrow('Commit something before publishing')
    expect(calls).toEqual([])
  })

  it('refuses a repository that already has an origin, or a bad name', async () => {
    commit()
    await expect(publishRepo(dir, { ...input, name: 'my app' })).rejects.toThrow('Use only letters')
    git(dir, 'remote', 'add', 'origin', remoteDir)
    await expect(publishRepo(dir, input)).rejects.toThrow('already has a remote called origin')
    expect(calls).toEqual([])
  })

  it('says what the host answered when it refuses to create the repository', async () => {
    commit()
    respond = () => ({ status: 422, json: { message: 'Repository creation failed.' } })
    await expect(publishRepo(dir, input)).rejects.toThrow("Couldn't create the repository: 422 Error: Repository creation failed.")
    expect(git(dir, 'remote')).toBe('')
  })
})
