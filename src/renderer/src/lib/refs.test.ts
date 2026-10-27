import { describe, expect, it } from 'vitest'
import { groupRefs, parseRefs, type RefBadge } from './refs'

const local = (label: string): RefBadge => ({ label, kind: 'local' })
const head = (label: string): RefBadge => ({ label, kind: 'head' })
const remote = (label: string): RefBadge => ({ label, kind: 'remote' })
const tag = (label: string): RefBadge => ({ label, kind: 'tag' })

describe('parseRefs', () => {
  it('tells head, local, remote and tag refs apart and drops symbolic HEADs', () => {
    const badges = parseRefs(
      ['HEAD -> main', 'origin/main', 'origin/HEAD', 'feature/x', 'tag: v1.0'],
      new Set(['main', 'feature/x']),
      new Set(['origin/main'])
    )
    expect(badges).toEqual([head('main'), remote('origin/main'), local('feature/x'), tag('v1.0')])
  })
})

describe('groupRefs', () => {
  it('puts a local branch and its same-named remote on one pill', () => {
    const pills = groupRefs([local('feature'), remote('origin/feature')])
    expect(pills).toHaveLength(1)
    expect(pills[0]).toMatchObject({ name: 'feature', primary: local('feature'), remotes: [remote('origin/feature')] })
  })

  it('uses the tracked upstream over a matching name', () => {
    const pills = groupRefs(
      [local('mine'), remote('origin/mine'), remote('origin/theirs')],
      new Map([['mine', 'origin/theirs']])
    )
    expect(pills.map((p) => p.name)).toEqual(['mine', 'mine'])
    expect(pills[0].remotes).toEqual([remote('origin/theirs')])
    expect(pills[1]).toMatchObject({ primary: remote('origin/mine'), local: null })
  })

  it('orders the checked-out branch first, then locals, remote-only branches and tags', () => {
    const pills = groupRefs([tag('v2'), remote('origin/other'), local('dev'), head('main'), remote('origin/main')])
    expect(pills.map((p) => p.primary.label)).toEqual(['main', 'dev', 'origin/other', 'v2'])
    expect(pills[0].remotes).toEqual([remote('origin/main')])
  })

  it('shares a pill between remote-only branches of the same name', () => {
    const pills = groupRefs([remote('origin/fix'), remote('upstream/fix')])
    expect(pills).toHaveLength(1)
    expect(pills[0]).toMatchObject({ name: 'fix', primary: remote('origin/fix') })
    expect(pills[0].remotes).toHaveLength(2)
  })
})
