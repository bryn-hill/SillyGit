import { describe, expect, it } from 'vitest'
import { commandsFor, expandCommand, normalizeCustomCommands, shQuote } from './customCommands'

describe('expandCommand', () => {
  const target = { repo: '/work/my repo', currentBranch: 'main', sha: 'abcdef1234567890', branch: "it's/new", file: 'src/a b.ts' }

  it('fills in and quotes placeholders, bare or braced', () => {
    expect(expandCommand('git show $SHORT_SHA -- $FILE', target)).toBe("git show abcdef1 -- 'src/a b.ts'")
    expect(expandCommand('echo ${BRANCH}x $SHA', target)).toBe(`echo 'it'\\''s/new'x abcdef1234567890`)
    expect(expandCommand('cd $REPO && git log $CURRENT_BRANCH', target)).toBe("cd '/work/my repo' && git log main")
  })

  it('leaves other dollar words alone', () => {
    expect(expandCommand('echo $HOME $SHAPE', target)).toBe('echo $HOME $SHAPE')
  })

  it('refuses a placeholder the target has no value for', () => {
    expect(() => expandCommand('git show $SHA', { repo: '/r' })).toThrow('$SHA has no value here.')
  })
})

describe('shQuote', () => {
  it('leaves plain words bare', () => {
    expect(shQuote('feature/x-1')).toBe('feature/x-1')
    expect(shQuote('a b')).toBe("'a b'")
  })
})

describe('normalizeCustomCommands', () => {
  it('drops junk and defaults the scope', () => {
    expect(normalizeCustomCommands([{ name: 'A', command: 'a', scope: 'bogus' }, 3, { name: 1 }])).toEqual([
      { id: 'cmd-0', name: 'A', command: 'a', scope: 'repo' }
    ])
    expect(normalizeCustomCommands('nope')).toEqual([])
  })
})

describe('commandsFor', () => {
  it('only offers named commands of that scope', () => {
    const all = normalizeCustomCommands([
      { id: '1', name: 'Open', command: 'open .', scope: 'repo' },
      { id: '2', name: '', command: 'x', scope: 'repo' },
      { id: '3', name: 'Show', command: 'git show $SHA', scope: 'commit' }
    ])
    expect(commandsFor(all, 'repo').map((c) => c.id)).toEqual(['1'])
  })
})
