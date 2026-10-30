import { describe, expect, it } from 'vitest'
import { commitsLabel, dropOptions, dropTargetOf, type DragSource } from './refDrag'

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
  const fake = (value: string | null): Element =>
    ({ closest: () => (value === null ? null : { getAttribute: () => value }) }) as unknown as Element

  it('reads the branch from the nearest drop target', () => {
    expect(dropTargetOf(fake('main'), branch('feature'))).toBe('main')
    expect(dropTargetOf(fake(null), branch('feature'))).toBeNull()
    expect(dropTargetOf(null, branch('feature'))).toBeNull()
  })

  it('ignores dropping a branch on itself', () => {
    expect(dropTargetOf(fake('feature'), branch('feature'))).toBeNull()
  })
})
