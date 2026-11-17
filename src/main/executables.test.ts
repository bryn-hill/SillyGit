import { describe, expect, it } from 'vitest'
import { searchPath } from './executables'

describe.skipIf(process.platform === 'win32')('searchPath', () => {
  it('keeps PATH first and adds the usual install folders, including where claude lives', () => {
    const dirs = searchPath('/usr/bin:/bin', '/Users/me')
    expect(dirs.slice(0, 2)).toEqual(['/usr/bin', '/bin'])
    expect(dirs).toContain('/opt/homebrew/bin')
    expect(dirs).toContain('/Users/me/.local/bin')
    expect(dirs).toContain('/Users/me/.claude/local')
  })

  it('lists each folder once', () => {
    const dirs = searchPath('/opt/homebrew/bin:/usr/bin', '/Users/me')
    expect(dirs.filter((d) => d === '/opt/homebrew/bin')).toHaveLength(1)
  })
})
