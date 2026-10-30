import { describe, expect, it } from 'vitest'
import { PROVIDERS, PROVIDER_ORDER, guessProvider, normalizeHost, normalizeOrganization, parseRemoteUrl } from './accounts'

describe('normalizeHost', () => {
  it('drops the scheme, user, path, trailing slash and case', () => {
    expect(normalizeHost('https://GitHub.example.com/')).toBe('github.example.com')
    expect(normalizeHost('  gitlab.com  ')).toBe('gitlab.com')
    expect(normalizeHost('http://me@git.example.org/some/path')).toBe('git.example.org')
    expect(normalizeHost('git@github.com')).toBe('github.com')
  })

  it('keeps a port, which a self-hosted server may need', () => {
    expect(normalizeHost('https://gitea.local:3000/')).toBe('gitea.local:3000')
  })
})

describe('parseRemoteUrl', () => {
  it('reads scp-style SSH remotes', () => {
    expect(parseRemoteUrl('git@github.com:bryn-hill/SillyGit.git')).toEqual({
      host: 'github.com',
      path: 'bryn-hill/SillyGit'
    })
    expect(parseRemoteUrl('GitHub.com:owner/repo')).toEqual({ host: 'github.com', path: 'owner/repo' })
  })

  it('reads https, ssh and git URLs, with or without a user and port', () => {
    expect(parseRemoteUrl('https://github.com/owner/repo.git')).toEqual({ host: 'github.com', path: 'owner/repo' })
    expect(parseRemoteUrl('https://token@gitlab.com/group/sub/repo/')).toEqual({
      host: 'gitlab.com',
      path: 'group/sub/repo'
    })
    expect(parseRemoteUrl('ssh://git@git.example.com:2222/team/app.git')).toEqual({
      host: 'git.example.com',
      path: 'team/app'
    })
    expect(parseRemoteUrl('git://example.org/proj')).toEqual({ host: 'example.org', path: 'proj' })
  })

  it('gives up on local paths and file URLs', () => {
    expect(parseRemoteUrl('/home/bryn/code/repo')).toBeNull()
    expect(parseRemoteUrl('../sibling')).toBeNull()
    expect(parseRemoteUrl('file:///srv/git/repo.git')).toBeNull()
    expect(parseRemoteUrl('')).toBeNull()
  })
})

describe('guessProvider', () => {
  it('knows the public hosts and the usual self-hosted names', () => {
    expect(guessProvider('github.com')).toBe('github')
    expect(guessProvider('github.mycorp.com')).toBe('github')
    expect(guessProvider('gitlab.com')).toBe('gitlab')
    expect(guessProvider('gitlab.example.org')).toBe('gitlab')
    expect(guessProvider('bitbucket.org')).toBe('bitbucket')
  })

  it('knows Azure DevOps hosts, old and new', () => {
    expect(guessProvider('dev.azure.com')).toBe('azure')
    expect(guessProvider('ssh.dev.azure.com')).toBe('azure')
    expect(guessProvider('contoso.visualstudio.com')).toBe('azure')
  })

  it("doesn't guess for anything else", () => {
    expect(guessProvider('git.example.com')).toBeNull()
    expect(guessProvider('mygithub.com')).toBeNull()
    expect(guessProvider('bitbucket.mycorp.com')).toBeNull()
  })
})

describe('PROVIDERS', () => {
  it('lists every provider once, in order', () => {
    expect([...PROVIDER_ORDER].sort()).toEqual(Object.keys(PROVIDERS).sort())
  })

  it('builds token pages on the given host', () => {
    expect(PROVIDERS.github.tokenUrl('github.example.com')).toMatch(/^https:\/\/github\.example\.com\/settings\/tokens\/new\?/)
    expect(PROVIDERS.gitlab.tokenUrl('gitlab.com')).toContain('https://gitlab.com/-/user_settings/personal_access_tokens')
    expect(PROVIDERS.gitea.tokenUrl('code.example.org')).toBe('https://code.example.org/user/settings/applications')
    // Bitbucket Cloud tokens are made on Atlassian's site whatever the host.
    expect(PROVIDERS.bitbucket.tokenUrl('anything')).toBe('https://id.atlassian.com/manage-profile/security/api-tokens')
  })

  it('only asks for a username where the token needs one', () => {
    expect(PROVIDER_ORDER.filter((p) => PROVIDERS[p].needsUsername)).toEqual(['bitbucket'])
    expect(PROVIDER_ORDER.filter((p) => !PROVIDERS[p].hostEditable)).toEqual(['bitbucket', 'azure'])
    expect(PROVIDER_ORDER.filter((p) => PROVIDERS[p].needsOrganization)).toEqual(['azure'])
  })

  it('opens the organization’s token page for Azure DevOps', () => {
    expect(PROVIDERS.azure.tokenUrl('dev.azure.com', 'contoso')).toBe('https://dev.azure.com/contoso/_usersSettings/tokens')
    expect(PROVIDERS.azure.tokenUrl('dev.azure.com')).toBe('https://dev.azure.com/')
  })
})

describe('normalizeOrganization', () => {
  it('takes the organization from a name or any of its addresses', () => {
    expect(normalizeOrganization(' contoso ')).toBe('contoso')
    expect(normalizeOrganization('https://dev.azure.com/contoso/Web/_git/site')).toBe('contoso')
    expect(normalizeOrganization('dev.azure.com/contoso')).toBe('contoso')
    expect(normalizeOrganization('https://contoso.visualstudio.com/')).toBe('contoso')
    expect(normalizeOrganization('')).toBe('')
  })
})
