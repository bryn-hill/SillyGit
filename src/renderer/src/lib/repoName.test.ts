import { describe, expect, it } from 'vitest'
import { repoDisplayName } from './repoName'

describe('repoDisplayName', () => {
  it('is the last folder of a POSIX or Windows path', () => {
    expect(repoDisplayName('/Users/bryn/code/SillyGit')).toBe('SillyGit')
    expect(repoDisplayName('/Users/bryn/code/SillyGit/')).toBe('SillyGit')
    expect(repoDisplayName('C:\\Users\\bryn\\code\\app')).toBe('app')
  })

  it('falls back to the path itself when there is no folder name', () => {
    expect(repoDisplayName('/')).toBe('/')
    expect(repoDisplayName('')).toBe('')
  })
})
