import { describe, expect, it } from 'vitest'
import { parseRemoteList, remoteNameProblem, shortRemoteUrl, suggestRemoteName } from './remotes'

describe('parseRemoteList', () => {
  it('pairs fetch and push lines and only keeps a push URL that differs', () => {
    const out = [
      'origin\tgit@github.com:me/app.git (fetch)',
      'origin\tgit@github.com:me/app.git (push)',
      'upstream\thttps://github.com/them/app.git (fetch)',
      'upstream\tno-push (push)',
      ''
    ].join('\n')
    expect(parseRemoteList(out)).toEqual([
      { name: 'origin', url: 'git@github.com:me/app.git', pushUrl: null },
      { name: 'upstream', url: 'https://github.com/them/app.git', pushUrl: 'no-push' }
    ])
  })

  it('keeps URLs with spaces and handles an empty list', () => {
    expect(parseRemoteList('local\t/Users/me/My Repos/app (fetch)\nlocal\t/Users/me/My Repos/app (push)')).toEqual([
      { name: 'local', url: '/Users/me/My Repos/app', pushUrl: null }
    ])
    expect(parseRemoteList('')).toEqual([])
  })
})

describe('suggestRemoteName', () => {
  it('offers origin, then upstream, then nothing', () => {
    expect(suggestRemoteName([])).toBe('origin')
    expect(suggestRemoteName(['origin'])).toBe('upstream')
    expect(suggestRemoteName(['origin', 'upstream'])).toBe('')
  })
})

describe('shortRemoteUrl', () => {
  it('drops the scheme, user, port and .git', () => {
    expect(shortRemoteUrl('git@github.com:owner/repo.git')).toBe('github.com/owner/repo')
    expect(shortRemoteUrl('https://github.com/owner/repo.git')).toBe('github.com/owner/repo')
    expect(shortRemoteUrl('ssh://git@host.example:2222/team/repo.git/')).toBe('host.example/team/repo')
  })

  it('leaves local paths alone', () => {
    expect(shortRemoteUrl('/srv/git/repo.git')).toBe('/srv/git/repo')
    expect(shortRemoteUrl('C:\\repos\\app')).toBe('C:\\repos\\app')
  })
})

describe('remoteNameProblem', () => {
  it('rejects empty, spaced and taken names', () => {
    expect(remoteNameProblem(' ', [])).toMatch(/Enter a name/)
    expect(remoteNameProblem('my fork', [])).toMatch(/spaces/)
    expect(remoteNameProblem('origin', ['origin'])).toMatch(/already/)
    expect(remoteNameProblem('upstream', ['origin'])).toBeNull()
  })
})
