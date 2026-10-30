import { describe, expect, it } from 'vitest'
import {
  AZURE_MERGE_STRATEGY_POLICY,
  azureMergeMethods,
  githubMergeMethods,
  initialMergeMethod,
  mergeArgs,
  type AzurePolicyConfiguration,
  type PrMergeMethods
} from './mergeOptions'

describe('mergeArgs', () => {
  it('maps each strategy to its git merge flags', () => {
    expect(mergeArgs('feature')).toEqual(['merge', '--no-edit', 'feature'])
    expect(mergeArgs('feature', 'no-ff')).toEqual(['merge', '--no-ff', '--no-edit', 'feature'])
    expect(mergeArgs('feature', 'ff-only')).toEqual(['merge', '--ff-only', 'feature'])
    expect(mergeArgs('feature', 'squash')).toEqual(['merge', '--squash', 'feature'])
  })
})

describe('githubMergeMethods', () => {
  it('offers only what the repository allows', () => {
    expect(githubMergeMethods({ allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: false })).toEqual({
      allowed: ['squash'],
      known: true
    })
  })

  it('offers everything when GitHub leaves the settings out', () => {
    expect(githubMergeMethods({})).toEqual({ allowed: ['merge', 'squash', 'rebase'], known: false })
  })
})

describe('azureMergeMethods', () => {
  const policy = (settings: AzurePolicyConfiguration['settings'], isEnabled = true): AzurePolicyConfiguration => ({
    isEnabled,
    type: { id: AZURE_MERGE_STRATEGY_POLICY },
    settings
  })
  const scope = [{ repositoryId: 'repo-1', refName: 'refs/heads/main', matchKind: 'Exact' }]

  it('offers everything when no policy covers the branch', () => {
    const other = policy({ allowSquash: true, scope: [{ repositoryId: 'repo-2', refName: 'refs/heads/main' }] })
    expect(azureMergeMethods([other], 'repo-1', 'refs/heads/main')).toMatchObject({ known: false })
    expect(azureMergeMethods([policy({ allowSquash: true, scope }, false)], 'repo-1', 'refs/heads/main').known).toBe(false)
  })

  it('offers what the branch policy allows', () => {
    const p = policy({ allowNoFastForward: false, allowSquash: true, allowRebase: true, scope })
    expect(azureMergeMethods([p], 'repo-1', 'refs/heads/main')).toEqual({ allowed: ['squash', 'rebase'], known: true })
  })

  it('matches prefix scopes and repo-wide policies', () => {
    const p = policy({ allowSquash: true, scope: [{ repositoryId: null, refName: 'refs/heads/release/', matchKind: 'Prefix' }] })
    expect(azureMergeMethods([p], 'repo-1', 'refs/heads/release/1.0').allowed).toEqual(['squash'])
  })

  it('reads the older squash-only form', () => {
    expect(azureMergeMethods([policy({ useSquashMerge: true, scope })], 'repo-1', 'refs/heads/main').allowed).toEqual(['squash'])
  })
})

describe('initialMergeMethod', () => {
  it('starts on the last method when still allowed, else the first allowed', () => {
    const methods: PrMergeMethods = { allowed: ['squash', 'rebase'], known: true }
    expect(initialMergeMethod(methods, 'rebase')).toBe('rebase')
    expect(initialMergeMethod(methods, 'merge')).toBe('squash')
    expect(initialMergeMethod(methods)).toBe('squash')
  })
})
