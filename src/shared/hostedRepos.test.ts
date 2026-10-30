import { describe, expect, it } from 'vitest'
import {
  accountLabel,
  filterHostedRepos,
  gitHostAccounts,
  repoNameProblem,
  sortHostedRepos,
  suggestRepoName,
  withoutUserInfo,
  type HostedRepo
} from './hostedRepos'
import type { ProviderAccount } from './accounts'

const repo = (fullName: string, updatedAt: string | null = null, description = ''): HostedRepo => ({
  accountId: 'a',
  provider: 'github',
  host: 'github.com',
  fullName,
  description,
  private: false,
  cloneUrl: `https://github.com/${fullName}.git`,
  sshUrl: null,
  webUrl: null,
  updatedAt
})

const account = (provider: ProviderAccount['provider'], host: string, extra: Partial<ProviderAccount> = {}): ProviderAccount => ({
  id: provider,
  provider,
  host,
  username: 'ada',
  displayName: 'Ada',
  avatar: null,
  emails: [],
  addedAt: '',
  ...extra
})

describe('filterHostedRepos', () => {
  const repos = [repo('ada/web-app', null, 'The shop front'), repo('acme/api'), repo('acme/web')]

  it('keeps repos whose name or description has every word', () => {
    expect(filterHostedRepos(repos, 'acme web').map((r) => r.fullName)).toEqual(['acme/web'])
    expect(filterHostedRepos(repos, 'SHOP').map((r) => r.fullName)).toEqual(['ada/web-app'])
  })

  it('keeps everything for an empty search', () => {
    expect(filterHostedRepos(repos, '  ')).toBe(repos)
  })
})

describe('sortHostedRepos', () => {
  it('puts the most recently changed first and undated ones last, in their order', () => {
    const sorted = sortHostedRepos([repo('a'), repo('b', '2026-01-01'), repo('c'), repo('d', '2026-10-01')])
    expect(sorted.map((r) => r.fullName)).toEqual(['d', 'b', 'a', 'c'])
  })
})

describe('withoutUserInfo', () => {
  it('drops the user name from HTTPS URLs only', () => {
    expect(withoutUserInfo('https://ada@bitbucket.org/acme/site.git')).toBe('https://bitbucket.org/acme/site.git')
    expect(withoutUserInfo('https://dev.azure.com/contoso/Web/_git/web')).toBe('https://dev.azure.com/contoso/Web/_git/web')
    expect(withoutUserInfo('git@github.com:a/b.git')).toBe('git@github.com:a/b.git')
  })
})

describe('repo names', () => {
  it('suggests a name every host accepts from the folder name', () => {
    expect(suggestRepoName('My App!')).toBe('My-App')
    expect(suggestRepoName('.dotfiles')).toBe('dotfiles')
    expect(suggestRepoName('side_project.v2')).toBe('side_project.v2')
  })

  it('explains names that can not be used', () => {
    expect(repoNameProblem('')).toMatch(/Enter a name/)
    expect(repoNameProblem('my app')).toMatch(/Use only letters/)
    expect(repoNameProblem('..')).toMatch(/can't be used/)
    expect(repoNameProblem('app.git')).toMatch(/can't be used/)
    expect(repoNameProblem('app')).toBeNull()
  })
})

describe('accounts', () => {
  it('leaves Jira out and labels hosts, self-hosted servers and organizations', () => {
    const accounts = [
      account('github', 'github.com'),
      account('jira', 'acme.atlassian.net'),
      account('gitlab', 'git.acme.dev'),
      account('azure', 'dev.azure.com', { organization: 'contoso' })
    ]
    expect(gitHostAccounts(accounts).map(accountLabel)).toEqual([
      'GitHub · ada',
      'GitLab (git.acme.dev) · ada',
      'Azure DevOps · contoso'
    ])
  })
})
