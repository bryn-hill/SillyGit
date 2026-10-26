import { describe, expect, it } from 'vitest'
import { resolveBranchRemote, splitRemoteRef } from './branchRemote'
import type { BranchInfo, RepoRemote } from './types'

const remotes: RepoRemote[] = [
  { name: 'origin', webUrl: 'https://github.com/owner/repo' },
  { name: 'SillyGit', webUrl: 'https://github.com/bryn-hill/sillygit' }
]
const branches: BranchInfo[] = [
  { name: 'main', current: true, remote: false, upstream: 'origin/main' },
  { name: 'local-only', current: false, remote: false }
]
const prs = [{ number: 16, url: 'https://github.com/bryn-hill/sillygit/pull/16', headRefName: 'renovate/xterm' }]

describe('splitRemoteRef', () => {
  it('uses the real remote name, even when the branch has slashes', () => {
    expect(splitRemoteRef('SillyGit/renovate/xterm', remotes)).toEqual({ remote: remotes[1], branch: 'renovate/xterm' })
  })

  it('returns null for a ref on no known remote', () => {
    expect(splitRemoteRef('upstream/main', remotes)).toBeNull()
  })
})

describe('resolveBranchRemote', () => {
  it('finds the pull request for a remote branch', () => {
    expect(resolveBranchRemote({ name: 'SillyGit/renovate/xterm', remote: true }, branches, remotes, prs)).toEqual({
      remote: 'SillyGit',
      webUrl: 'https://github.com/bryn-hill/sillygit',
      remoteBranch: 'renovate/xterm',
      pullRequest: { number: 16, url: 'https://github.com/bryn-hill/sillygit/pull/16' }
    })
  })

  it('links a local branch through its upstream', () => {
    const info = resolveBranchRemote({ name: 'main', remote: false }, branches, remotes, prs)
    expect(info).toMatchObject({ remote: 'origin', remoteBranch: 'main', pullRequest: null })
  })

  it('gives an unpushed branch the default remote but no remote branch', () => {
    const info = resolveBranchRemote({ name: 'local-only', remote: false }, branches, remotes, prs)
    expect(info).toMatchObject({ remote: 'origin', remoteBranch: null, pullRequest: null })
  })
})
