import { describe, expect, it } from 'vitest'
import { checkoutNotice, isForkPullRequest, pullRequestBranchNames, type PullRequestHead } from './prCheckout'

const head = (headRepo: PullRequestHead['headRepo'], headRefName = 'fix'): PullRequestHead => ({
  number: 12,
  host: 'github.com',
  baseRepo: { owner: 'bryn', name: 'app' },
  headRepo,
  headRefName
})

describe('pull request checkout names', () => {
  it('tries the head branch, then owner/branch for a fork, then pr/<number>', () => {
    expect(pullRequestBranchNames(head({ owner: 'Bryn', name: 'App' }))).toEqual(['fix', 'pr/12'])
    expect(pullRequestBranchNames(head({ owner: 'junior', name: 'app' }, 'main'))).toEqual(['main', 'junior/main', 'pr/12'])
    expect(pullRequestBranchNames(head(null))).toEqual(['fix', 'pr/12'])
  })

  it('treats a deleted fork as a fork', () => {
    expect(isForkPullRequest(head(null))).toBe(true)
    expect(isForkPullRequest(head({ owner: 'bryn', name: 'app' }))).toBe(false)
  })
})

describe('checkoutNotice', () => {
  const result = { branch: 'fix', created: false, updated: false, diverged: false, upstream: null }
  it('says what happened to the branch', () => {
    expect(checkoutNotice(12, { ...result, created: true, upstream: 'origin/fix' })).toBe('Checked out #12 as fix (tracking origin/fix).')
    expect(checkoutNotice(12, { ...result, updated: true })).toBe('Switched to fix and fast-forwarded it to #12.')
    expect(checkoutNotice(12, { ...result, diverged: true })).toBe("Switched to fix. It has commits #12 doesn't, so it wasn't fast-forwarded.")
    expect(checkoutNotice(12, result)).toBe('Switched to fix, already up to date with #12.')
  })
})
