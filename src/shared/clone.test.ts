import { describe, expect, it } from 'vitest'
import { repoNameFromUrl } from './clone'

describe('repoNameFromUrl', () => {
  it('takes the last path segment without .git', () => {
    expect(repoNameFromUrl('https://github.com/bryn-hill/SillyGit.git')).toBe('SillyGit')
    expect(repoNameFromUrl('https://github.com/bryn-hill/SillyGit/')).toBe('SillyGit')
    expect(repoNameFromUrl('git@github.com:bryn-hill/sillygit.git')).toBe('sillygit')
    expect(repoNameFromUrl('/Users/bryn/code/thing/.git')).toBe('thing')
    expect(repoNameFromUrl('  https://host/r.git  ')).toBe('r')
  })

  it('gives up on URLs with no name in them', () => {
    expect(repoNameFromUrl('')).toBeNull()
    expect(repoNameFromUrl('https://')).toBeNull()
  })
})
