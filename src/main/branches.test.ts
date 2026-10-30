import { describe, expect, it } from 'vitest'
import { remoteWebUrl } from './branches'

describe('remoteWebUrl', () => {
  it.each([
    ['git@github.com:owner/repo.git', 'https://github.com/owner/repo'],
    ['https://github.com/owner/repo.git', 'https://github.com/owner/repo'],
    ['https://user@github.com/owner/repo', 'https://github.com/owner/repo'],
    ['ssh://git@github.com:22/owner/repo.git', 'https://github.com/owner/repo'],
    ['https://gitlab.com/group/sub/repo.git/', 'https://gitlab.com/group/sub/repo'],
    ['git@ssh.dev.azure.com:v3/contoso/Web/site', 'https://dev.azure.com/contoso/Web/_git/site'],
    ['https://contoso@dev.azure.com/contoso/Web/_git/site', 'https://dev.azure.com/contoso/Web/_git/site'],
    ['https://contoso.visualstudio.com/DefaultCollection/Web/_git/site', 'https://dev.azure.com/contoso/Web/_git/site']
  ])('%s -> %s', (url, expected) => {
    expect(remoteWebUrl(url)).toBe(expected)
  })

  it('returns null for a local path', () => {
    expect(remoteWebUrl('/tmp/some/repo.git')).toBeNull()
  })
})
