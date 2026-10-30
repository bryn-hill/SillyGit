import { describe, expect, it } from 'vitest'
import { commitsLabel, dropOptions, dropTargetName, dropTargetOf, squashOptions, type DragSource } from './refDrag'

const branch = (name: string, remote = false): DragSource => ({ kind: 'branch', name, remote })
const rel = (targetContainsSource: boolean, sourceContainsTarget: boolean) => ({
  sourceHash: 'a',
  targetHash: 'b',
  targetContainsSource,
  sourceContainsTarget
})
const labels = (opts: ReturnType<typeof dropOptions>): string[] => opts.map((o) => o.label)

describe('dropOptions', () => {
  it('offers merge and rebase for diverged branches', () => {
    expect(labels(dropOptions(branch('feature'), 'main', rel(false, false)))).toEqual([
      'Merge feature into main',
      'Merge feature into main with…',
      'Rebase feature onto main'
    ])
  })

  it('offers a fast-forward when the target is behind, and no rebase', () => {
    expect(labels(dropOptions(branch('feature'), 'main', rel(false, true)))).toEqual([
      'Fast-forward main to feature',
      'Merge feature into main',
      'Merge feature into main with…'
    ])
  })

  it('never offers to rebase a remote branch', () => {
    expect(labels(dropOptions(branch('origin/feature', true), 'main', rel(false, false)))).toEqual([
      'Merge origin/feature into main',
      'Merge origin/feature into main with…'
    ])
  })

  it('offers the other merge strategies in a submenu', () => {
    const withMenu = dropOptions(branch('feature'), 'main', rel(false, false)).find((o) => o.submenu)
    expect(withMenu?.submenu?.map((o) => [o.action, o.strategy])).toEqual([
      ['merge', 'no-ff'],
      ['merge', 'ff-only'],
      ['merge', 'squash']
    ])
  })

  it('says when there is nothing to merge', () => {
    const [only, ...rest] = dropOptions(branch('feature'), 'main', rel(true, false))
    expect(rest).toEqual([])
    expect(only).toMatchObject({ label: 'main already has feature', disabled: true })
  })

  it('cherry-picks dropped commits, disabled when the branch already has the one commit', () => {
    const one: DragSource = { kind: 'commits', hashes: ['abc'], label: 'abc1234' }
    expect(dropOptions(one, 'main', rel(false, false))).toEqual([
      { action: 'cherry-pick', label: 'Cherry-pick abc1234 onto main' }
    ])
    expect(dropOptions(one, 'main', rel(true, false))[0]).toMatchObject({ disabled: true })
    const two: DragSource = { kind: 'commits', hashes: ['a', 'b'], label: '2 commits' }
    expect(dropOptions(two, 'main', rel(true, false))[0].disabled).toBeUndefined()
  })

  it('shortens long names in labels and keeps the whole text in the title', () => {
    const [merge] = dropOptions(branch('very-long-branch-name'), 'main', rel(false, false), (n) =>
      n.length > 8 ? `${n.slice(0, 7)}…` : n
    )
    expect(merge).toEqual({ action: 'merge', label: 'Merge very-lo… into main', title: 'Merge very-long-branch-name into main' })
  })
})

describe('commitsLabel', () => {
  it('names one commit by its short hash and several by count', () => {
    expect(commitsLabel(['0123456789abcdef'])).toBe('0123456')
    expect(commitsLabel(['a', 'b', 'c'])).toBe('3 commits')
  })
})

describe('dropTargetOf', () => {
  const fake = (attrs: Record<string, string> | null): Element =>
    ({ closest: () => (attrs === null ? null : { getAttribute: (name: string) => attrs[name] ?? null }) }) as unknown as Element
  const commits: DragSource = { kind: 'commits', hashes: ['c1'], label: 'c1' }

  it('reads the branch from the nearest drop target', () => {
    expect(dropTargetOf(fake({ 'data-drop-branch': 'main' }), branch('feature'))).toEqual({ branch: 'main', commit: null })
    expect(dropTargetOf(fake(null), branch('feature'))).toBeNull()
    expect(dropTargetOf(null, branch('feature'))).toBeNull()
  })

  it('ignores dropping a branch on itself', () => {
    expect(dropTargetOf(fake({ 'data-drop-branch': 'feature' }), branch('feature'))).toBeNull()
  })

  it('reads the commit only for dragged commits, and not one of them', () => {
    const row = fake({ 'data-drop-branch': 'main', 'data-drop-commit': 'c2' })
    expect(dropTargetOf(row, commits)).toEqual({ branch: 'main', commit: 'c2' })
    expect(dropTargetOf(row, branch('feature'))).toEqual({ branch: 'main', commit: null })
    expect(dropTargetOf(fake({ 'data-drop-commit': 'c2' }), branch('feature'))).toBeNull()
    expect(dropTargetOf(fake({ 'data-drop-commit': 'c1' }), commits)).toBeNull()
  })

  it('names a branch target before a commit', () => {
    expect(dropTargetName({ branch: 'main', commit: 'abcdef0123' })).toBe('main')
    expect(dropTargetName({ branch: null, commit: 'abcdef0123' })).toBe('abcdef0')
  })
})

describe('squashOptions', () => {
  const commits: DragSource = { kind: 'commits', hashes: ['c1'], label: '1111111' }

  it('offers squash and fix up', () => {
    expect(squashOptions(commits, '2222222abc', true).map((o) => o.label)).toEqual([
      'Squash 1111111 into 2222222',
      'Fix up 2222222 with 1111111'
    ])
  })

  it('says why when the commits are off the checked-out branch', () => {
    const [only, ...rest] = squashOptions(commits, '2222222abc', false)
    expect(rest).toEqual([])
    expect(only.disabled).toBe(true)
    expect(only.title).toMatch(/checked-out branch/)
  })

  it('offers nothing for a dragged branch', () => {
    expect(squashOptions(branch('feature'), '2222222', true)).toEqual([])
  })
})
