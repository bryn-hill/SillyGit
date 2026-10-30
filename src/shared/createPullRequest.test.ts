import { describe, expect, it } from 'vitest'
import {
  baseChoices,
  canOpenPullRequests,
  createProblem,
  defaultBase,
  headChoices,
  headRemoteBranch,
  newPullRequestWebUrl,
  parseReviewers,
  pullRequestHostLabel
} from './createPullRequest'
import type { BranchInfo, RepoRemote } from './types'

const remotes: RepoRemote[] = [
  { name: 'origin', webUrl: 'https://github.com/bryn/app' },
  { name: 'fork', webUrl: 'https://github.com/someone/app' }
]

const branches: BranchInfo[] = [
  { name: 'main', current: true, remote: false, upstream: 'origin/main' },
  { name: 'feature/login', current: false, remote: false, upstream: 'origin/feature/login', ahead: 2 },
  { name: 'spike', current: false, remote: false },
  { name: 'renamed', current: false, remote: false, upstream: 'origin/old-name' },
  { name: 'gone', current: false, remote: false, upstream: 'origin/gone', upstreamGone: true },
  { name: 'theirs', current: false, remote: false, upstream: 'fork/theirs' },
  { name: 'origin/HEAD', current: false, remote: true },
  { name: 'origin/main', current: false, remote: true },
  { name: 'origin/feature/login', current: false, remote: true },
  { name: 'origin/old-name', current: false, remote: true },
  { name: 'origin/release', current: false, remote: true },
  { name: 'fork/theirs', current: false, remote: true }
]

describe('baseChoices', () => {
  it("lists the remote's branches without its prefix or HEAD", () => {
    expect(baseChoices(branches, remotes, 'origin')).toEqual(['main', 'feature/login', 'old-name', 'release'])
    expect(baseChoices(branches, remotes, 'fork')).toEqual(['theirs'])
  })
})

describe('headChoices', () => {
  it('says which local branches are pushed, ahead or not published yet', () => {
    const heads = headChoices(branches, remotes, 'origin')
    expect(heads.map((h) => [h.ref, h.state])).toEqual([
      ['main', { kind: 'pushed', remoteBranch: 'main' }],
      ['feature/login', { kind: 'ahead', remoteBranch: 'feature/login', ahead: 2 }],
      ['spike', { kind: 'unpublished' }],
      ['renamed', { kind: 'pushed', remoteBranch: 'old-name' }],
      ['gone', { kind: 'unpublished' }],
      ['theirs', { kind: 'unpublished' }],
      // Only remote branches no local branch tracks.
      ['origin/release', { kind: 'pushed', remoteBranch: 'release' }]
    ])
  })

  it("names the head by what it'll be called on the remote", () => {
    const heads = headChoices(branches, remotes, 'origin')
    expect(heads.map(headRemoteBranch)).toEqual(['main', 'feature/login', 'spike', 'old-name', 'gone', 'theirs', 'release'])
  })
})

describe('defaultBase', () => {
  const bases = ['develop', 'main', 'feature/login']

  it('prefers the branch asked for, then main, master or develop', () => {
    expect(defaultBase(bases, 'feature/login', 'spike')).toBe('feature/login')
    expect(defaultBase(bases, null, 'spike')).toBe('main')
    expect(defaultBase(bases, 'missing', 'spike')).toBe('main')
    expect(defaultBase(['develop', 'x'], null, 'spike')).toBe('develop')
    expect(defaultBase(['x', 'y'], null, 'spike')).toBe('x')
  })

  it("never picks the head itself", () => {
    expect(defaultBase(bases, 'main', 'main')).toBe('develop')
    expect(defaultBase(['main'], null, 'main')).toBeNull()
  })
})

describe('parseReviewers', () => {
  it('splits on commas and spaces, dropping @ and repeats', () => {
    expect(parseReviewers(' alice, @bob carol,,Alice ')).toEqual(['alice', 'bob', 'carol'])
    expect(parseReviewers('')).toEqual([])
  })
})

describe('createProblem', () => {
  const head = { ref: 'spike', remote: 'origin', state: { kind: 'unpublished' as const } }

  it('needs a head, a base, different branches and a title', () => {
    expect(createProblem({ base: 'main', head: null, title: 'x' })).toMatch(/Pick a branch/)
    expect(createProblem({ base: null, head, title: 'x' })).toMatch(/origin has no branch/)
    expect(createProblem({ base: 'spike', head, title: 'x' })).toMatch(/same branch/)
    expect(createProblem({ base: 'main', head, title: '  ' })).toMatch(/title/)
    expect(createProblem({ base: 'main', head, title: 'Spike' })).toBeNull()
  })
})

describe('canOpenPullRequests', () => {
  it('is for GitHub and hosts it might be, not GitLab or Bitbucket', () => {
    expect(canOpenPullRequests('https://github.com/bryn/app')).toBe(true)
    expect(canOpenPullRequests('https://github.example.com/bryn/app')).toBe(true)
    expect(canOpenPullRequests('https://git.example.com/bryn/app')).toBe(true)
    expect(canOpenPullRequests('https://gitlab.com/bryn/app')).toBe(false)
    expect(canOpenPullRequests('https://bitbucket.org/bryn/app')).toBe(false)
    expect(canOpenPullRequests(null)).toBe(false)
  })
})

describe('Azure DevOps remotes', () => {
  const azure = 'https://dev.azure.com/contoso/Web/_git/site'

  it('can open pull requests there too', () => {
    expect(canOpenPullRequests(azure)).toBe(true)
    expect(pullRequestHostLabel(azure)).toBe('Azure DevOps')
    expect(pullRequestHostLabel('https://github.com/bryn/app')).toBe('GitHub')
  })

  it("links each service's own new pull request form", () => {
    expect(newPullRequestWebUrl(azure, 'main', 'feature')).toBe(`${azure}/pullrequestcreate?sourceRef=feature&targetRef=main`)
    expect(newPullRequestWebUrl('https://github.com/bryn/app', 'main', 'feature')).toBe(
      'https://github.com/bryn/app/compare/main...feature?expand=1'
    )
  })
})
