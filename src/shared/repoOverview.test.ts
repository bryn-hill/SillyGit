import { describe, expect, it } from 'vitest'
import { groupedSections, knownRepos, moveRepoToGroup, normalizeRepoGroups, parseStatusSummary } from './repoOverview'

describe('parseStatusSummary', () => {
  it('reads the branch, upstream, ahead/behind and change counts', () => {
    const out = [
      '# branch.oid 1234567890abcdef',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -5',
      '1 .M N... 100644 100644 100644 aaa bbb src/a.ts',
      '1 M. N... 100644 100644 100644 aaa bbb src/b.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new.ts\told.ts',
      'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
      '? notes.txt',
      ''
    ].join('\n')
    expect(parseStatusSummary('/r', out)).toEqual({
      path: '/r',
      branch: 'main',
      head: '1234567',
      upstream: 'origin/main',
      ahead: 2,
      behind: 5,
      changes: 5,
      conflicts: 1
    })
  })

  it('handles a detached HEAD with no upstream', () => {
    const s = parseStatusSummary('/r', '# branch.oid abcdef1234\n# branch.head (detached)\n')
    expect(s).toMatchObject({ branch: null, head: 'abcdef1', upstream: null, ahead: 0, behind: 0, changes: 0 })
  })

  it('handles a repo with no commits yet', () => {
    const s = parseStatusSummary('/r', '# branch.oid (initial)\n# branch.head main\n? a.txt\n')
    expect(s).toMatchObject({ branch: 'main', head: null, changes: 1 })
  })
})

describe('normalizeRepoGroups', () => {
  it('drops junk, blank and duplicate names, and repos already in an earlier group', () => {
    expect(
      normalizeRepoGroups([
        { name: ' Work ', repos: ['/a', '/b', 3] },
        { name: 'work', repos: ['/c'] },
        { name: '', repos: ['/d'] },
        null,
        { name: 'Home', repos: ['/b', '/e'] },
        { name: 'Empty' }
      ])
    ).toEqual([
      { name: 'Work', repos: ['/a', '/b'] },
      { name: 'Home', repos: ['/e'] },
      { name: 'Empty', repos: [] }
    ])
    expect(normalizeRepoGroups(undefined)).toEqual([])
  })
})

describe('knownRepos and groupedSections', () => {
  const groups = [
    { name: 'Work', repos: ['/w1', '/w2'] },
    { name: 'Empty', repos: [] }
  ]

  it('lists each repo once: tabs, workspace, then grouped', () => {
    expect(knownRepos(['/t', '/w1'], ['/ws', '/t'], groups)).toEqual(['/t', '/w1', '/ws', '/w2'])
  })

  it('puts repos in no group last, under a null name', () => {
    const repos = knownRepos(['/t'], [], groups)
    expect(groupedSections(repos, groups)).toEqual([
      { name: 'Work', repos: ['/w1', '/w2'] },
      { name: 'Empty', repos: [] },
      { name: null, repos: ['/t'] }
    ])
  })

  it('leaves out the ungrouped section when everything is grouped', () => {
    expect(groupedSections(['/w1'], groups)).toEqual([
      { name: 'Work', repos: ['/w1'] },
      { name: 'Empty', repos: [] }
    ])
  })
})

describe('moveRepoToGroup', () => {
  const groups = [
    { name: 'A', repos: ['/1', '/2'] },
    { name: 'B', repos: ['/3'] }
  ]

  it('moves a repo from one group to the end of another', () => {
    expect(moveRepoToGroup(groups, '/1', 'B')).toEqual([
      { name: 'A', repos: ['/2'] },
      { name: 'B', repos: ['/3', '/1'] }
    ])
  })

  it('takes a repo out of every group with null', () => {
    expect(moveRepoToGroup(groups, '/3', null)).toEqual([
      { name: 'A', repos: ['/1', '/2'] },
      { name: 'B', repos: [] }
    ])
  })
})
