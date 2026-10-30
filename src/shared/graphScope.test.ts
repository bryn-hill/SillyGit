import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRAPH_SCOPE,
  graphRevisionArgs,
  graphScopeLabel,
  isDefaultScope,
  normalizeGraphScope,
  toggleCurrentOnly,
  toggleHidden,
  toggleSolo,
  type GraphScope
} from './graphScope'

const feat = { name: 'feat', remote: false }
const originFeat = { name: 'origin/feat', remote: true }

const refs = [
  { refname: 'refs/heads/main', upstream: 'refs/remotes/origin/main' },
  { refname: 'refs/heads/feat', upstream: 'refs/remotes/origin/feat' },
  { refname: 'refs/heads/local-only', upstream: 'refs/remotes/origin/local-only' },
  { refname: 'refs/remotes/origin/main', upstream: '' },
  { refname: 'refs/remotes/origin/feat', upstream: '' }
]

describe('normalizeGraphScope', () => {
  it('falls back to showing everything', () => {
    expect(normalizeGraphScope(undefined)).toEqual(DEFAULT_GRAPH_SCOPE)
    expect(normalizeGraphScope('nonsense')).toEqual(DEFAULT_GRAPH_SCOPE)
  })

  it('keeps valid branches and drops junk and duplicates', () => {
    expect(
      normalizeGraphScope({ hidden: [feat, feat, { name: '' }, 3, originFeat], solo: { name: 'main' }, currentOnly: 'yes' })
    ).toEqual({ hidden: [feat, originFeat], solo: { name: 'main', remote: false }, currentOnly: false })
  })
})

describe('toggles', () => {
  it('hides and shows a branch again', () => {
    const hidden = toggleHidden(DEFAULT_GRAPH_SCOPE, { ...feat, current: false } as typeof feat)
    expect(hidden.hidden).toEqual([feat])
    expect(isDefaultScope(toggleHidden(hidden, feat))).toBe(true)
  })

  it('soloing a hidden branch unhides it, and hiding the soloed one ends the solo', () => {
    const solo = toggleSolo(toggleHidden(DEFAULT_GRAPH_SCOPE, feat), feat)
    expect(solo).toEqual({ hidden: [], solo: feat, currentOnly: false })
    expect(toggleHidden(solo, feat)).toEqual({ hidden: [feat], solo: null, currentOnly: false })
    expect(toggleSolo(solo, feat).solo).toBeNull()
  })

  it('solo and current-branch-only replace each other', () => {
    const current = toggleCurrentOnly(toggleSolo(DEFAULT_GRAPH_SCOPE, feat))
    expect(current).toEqual({ hidden: [], solo: null, currentOnly: true })
    expect(toggleSolo(current, feat)).toEqual({ hidden: [], solo: feat, currentOnly: false })
  })
})

describe('graphScopeLabel', () => {
  it('describes what is left out', () => {
    expect(graphScopeLabel(DEFAULT_GRAPH_SCOPE)).toBeNull()
    expect(graphScopeLabel({ ...DEFAULT_GRAPH_SCOPE, hidden: [feat] })).toBe('feat hidden')
    expect(graphScopeLabel({ ...DEFAULT_GRAPH_SCOPE, hidden: [feat, originFeat] })).toBe('2 branches hidden')
    expect(graphScopeLabel({ ...DEFAULT_GRAPH_SCOPE, currentOnly: true })).toBe('Current branch only')
    expect(graphScopeLabel({ ...DEFAULT_GRAPH_SCOPE, solo: feat })).toBe('Only feat')
  })
})

describe('graphRevisionArgs', () => {
  const args = (scope: Partial<GraphScope>, current: string | null = 'main'): string[] =>
    graphRevisionArgs({ ...DEFAULT_GRAPH_SCOPE, ...scope }, refs, ['origin', 'upstream'], current)

  it('draws every branch, less stashes and lanes internals, by default', () => {
    expect(args({})).toEqual(['--exclude=refs/stash', '--exclude=refs/sillygit/*', '--all'])
  })

  it('hides a local branch with its remote copies, and a remote branch on its own', () => {
    expect(args({ hidden: [feat, { name: 'upstream/x', remote: true }] })).toEqual([
      '--exclude=refs/stash',
      '--exclude=refs/sillygit/*',
      '--exclude=refs/heads/feat',
      '--exclude=refs/remotes/origin/feat',
      '--exclude=refs/remotes/upstream/feat',
      '--exclude=refs/remotes/upstream/x',
      '--all'
    ])
  })

  it('escapes glob characters so a hidden name only matches itself', () => {
    expect(args({ hidden: [{ name: 'odd*[name]?', remote: true }] })).toContain('--exclude=refs/remotes/odd\\*\\[name]\\?')
  })

  it('solos a branch with its upstream', () => {
    expect(args({ solo: feat })).toEqual(['refs/heads/feat', 'refs/remotes/origin/feat'])
    expect(args({ solo: originFeat })).toEqual(['refs/remotes/origin/feat'])
    // An upstream that's gone from the remote is left out rather than failing the log.
    expect(args({ solo: { name: 'local-only', remote: false } })).toEqual(['refs/heads/local-only'])
  })

  it('falls back to every branch when the soloed one is gone', () => {
    expect(args({ solo: { name: 'deleted', remote: false } }).at(-1)).toBe('--all')
  })

  it('limits to HEAD and its upstream for the current branch only', () => {
    expect(args({ currentOnly: true })).toEqual(['HEAD', 'refs/remotes/origin/main'])
    expect(args({ currentOnly: true }, null)).toEqual(['HEAD'])
  })
})
