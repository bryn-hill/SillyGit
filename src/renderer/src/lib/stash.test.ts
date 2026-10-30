import { describe, expect, it } from 'vitest'
import { stashBranch, stashTitle } from './stash'

describe('stash messages', () => {
  it('reads the title and branch from what git wrote', () => {
    expect(stashTitle('WIP on main: 1a2b3c4 Fix the thing')).toBe('Fix the thing')
    expect(stashTitle('On feature/x: half done')).toBe('half done')
    expect(stashTitle('odd')).toBe('odd')
    expect(stashBranch('WIP on main: 1a2b3c4 Fix the thing')).toBe('main')
    expect(stashBranch('On feature/x: half done')).toBe('feature/x')
    expect(stashBranch('odd')).toBeNull()
  })
})
