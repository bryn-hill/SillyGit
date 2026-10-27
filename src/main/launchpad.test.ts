import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GhStylePullRequest } from './github'
import type { GithubAccess } from './hosting'

// The gh CLI and the GitHub API are both stand-ins here.
const fake = vi.hoisted(() => ({
  gh: (async () => '') as (cwd: string, args: string[]) => Promise<string>,
  access: new Map<string, GithubAccess>(),
  api: (async () => ({ authored: [], reviewRequested: [] })) as (
    repo: string
  ) => Promise<{ authored: GhStylePullRequest[]; reviewRequested: GhStylePullRequest[] }>,
  merged: [] as string[]
}))

vi.mock('child_process', () => ({
  execFile: (
    file: string,
    args: string[],
    opts: { cwd: string },
    cb: (err: unknown, out?: { stdout: string; stderr: string }) => void
  ) => {
    if (file !== 'gh') throw new Error(`unexpected ${file}`)
    fake.gh(opts.cwd, args).then(
      (stdout) => cb(null, { stdout, stderr: '' }),
      (err) => cb(err)
    )
  }
}))

vi.mock('./hosting', () => ({
  githubAccess: async (repoPath: string) => fake.access.get(repoPath) ?? null
}))

vi.mock('./github', () => ({
  launchpadPullRequests: (_creds: unknown, repo: { name: string }) => fake.api(repo.name),
  mergePullRequest: async (_creds: unknown, repo: { name: string }, n: number) => void fake.merged.push(`${repo.name}#${n}`)
}))

import { getLaunchpadData, mergePullRequest } from './launchpad'
import { HttpError } from './http'

const pr = (number: number, extra: Partial<GhStylePullRequest> = {}): GhStylePullRequest => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  author: { login: 'ada' },
  isDraft: false,
  headRefName: `branch-${number}`,
  baseRefName: 'main',
  mergeable: 'MERGEABLE',
  reviewDecision: '',
  reviewRequests: [null],
  reviews: [],
  statusCheckRollup: [],
  updatedAt: '2026-10-01T00:00:00Z',
  additions: 1,
  deletions: 2,
  ...extra
})

const ghError = (stderr: string, code?: string): Error => Object.assign(new Error('Command failed'), { stderr, code })

/** Answers gh like a signed-in user "ada", with `authored` and `requested` PRs for every repo. */
function ghAnswers(authored: GhStylePullRequest[], requested: GhStylePullRequest[] = []): void {
  fake.gh = async (_cwd, args) => {
    if (args[0] === 'api') return 'ada\n'
    if (args.includes('@me') && args.includes('--author')) return JSON.stringify(authored)
    if (args.includes('review-requested:@me')) return JSON.stringify(requested)
    if (args[0] === 'pr' && args[1] === 'merge') return ''
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
}

const access = (username: string): GithubAccess => ({
  repo: { host: 'github.com', owner: 'o', name: 'api-repo' },
  creds: { provider: 'github', host: 'github.com', token: 't' },
  account: { id: '1', provider: 'github', host: 'github.com', username, displayName: username, avatar: null, emails: [], addedAt: '' }
})

beforeEach(() => {
  fake.access.clear()
  fake.merged = []
  ghAnswers([])
})

describe('buckets', () => {
  const bucketOf = async (extra: Partial<GhStylePullRequest>, mine = true): Promise<string> => {
    if (mine) ghAnswers([pr(1, extra)])
    else ghAnswers([], [pr(1, { author: { login: 'grace' }, ...extra })])
    const data = await getLaunchpadData(['/repos/app'])
    return data.pullRequests[0].bucket
  }

  it('sorts my pull requests by what they need next', async () => {
    expect(await bucketOf({ isDraft: true, reviewDecision: 'APPROVED' })).toBe('draft')
    expect(await bucketOf({ mergeable: 'CONFLICTING', reviewDecision: 'APPROVED' })).toBe('conflicts')
    expect(await bucketOf({ statusCheckRollup: [{ state: 'SUCCESS' }, { state: 'ERROR' }] })).toBe('failingCI')
    expect(await bucketOf({ reviewDecision: 'APPROVED' })).toBe('readyToMerge')
    expect(await bucketOf({ reviewDecision: 'CHANGES_REQUESTED' })).toBe('changesRequested')
    expect(await bucketOf({ reviewRequests: [] })).toBe('unassignedReviewers')
    expect(await bucketOf({ reviews: [{ author: { login: 'grace' }, state: 'COMMENTED' }] })).toBe('reviewerCommented')
    expect(await bucketOf({})).toBe('waitingForReview')
  })

  it("doesn't count my own replies as a review", async () => {
    expect(await bucketOf({ reviewRequests: [], reviews: [{ author: { login: 'ada' }, state: 'COMMENTED' }] })).toBe(
      'unassignedReviewers'
    )
  })

  it('reads check runs as well as commit statuses', async () => {
    const run = (status: string, conclusion: string): { state?: string } => ({ status, conclusion }) as { state?: string }
    expect(await bucketOf({ statusCheckRollup: [run('COMPLETED', 'TIMED_OUT')] })).toBe('failingCI')
    expect(await bucketOf({ statusCheckRollup: [run('COMPLETED', 'SUCCESS'), run('IN_PROGRESS', '')] })).toBe(
      'waitingForReview'
    )
    expect(await bucketOf({ statusCheckRollup: [{ state: 'PENDING' }], reviewDecision: 'APPROVED' })).toBe('readyToMerge')
  })

  it("puts other people's pull requests under my review, unless they're drafts", async () => {
    expect(await bucketOf({ reviewDecision: 'APPROVED' }, false)).toBe('needsMyReview')
    expect(await bucketOf({ isDraft: true }, false)).toBe('draft')
  })
})

describe('getLaunchpadData through gh', () => {
  it('is connected with nothing to show for no repos', async () => {
    expect(await getLaunchpadData([])).toEqual({ connected: true, pullRequests: [] })
  })

  it('merges repos, drops my own PRs from the review list, and sorts by bucket then recency', async () => {
    ghAnswers(
      [
        pr(1, { updatedAt: '2026-10-01T00:00:00Z' }),
        pr(2, { reviewDecision: 'APPROVED', updatedAt: '2026-09-01T00:00:00Z' }),
        pr(3, { updatedAt: '2026-10-05T00:00:00Z' })
      ],
      [pr(9, { author: { login: 'grace' } }), pr(1)]
    )
    const data = await getLaunchpadData(['/repos/app', '/repos/app'])
    expect(data.connected).toBe(true)
    expect(data.login).toBe('ada')
    expect(data.skippedRepos).toEqual([])
    expect(data.pullRequests.map((p) => [p.number, p.bucket, p.isMine])).toEqual([
      [2, 'readyToMerge', true],
      [9, 'needsMyReview', false],
      [3, 'waitingForReview', true],
      [1, 'waitingForReview', true]
    ])
    expect(data.pullRequests[0]).toMatchObject({ repoPath: '/repos/app', repoName: 'app', additions: 1, deletions: 2 })
  })

  it('says when gh is missing or signed out', async () => {
    fake.gh = async () => {
      throw ghError('', 'ENOENT')
    }
    expect(await getLaunchpadData(['/r'])).toEqual({ connected: false, reason: 'gh-not-installed', pullRequests: [] })
    fake.gh = async () => {
      throw ghError('You are not logged into any GitHub hosts. Run gh auth login to authenticate.')
    }
    expect(await getLaunchpadData(['/r'])).toMatchObject({ connected: false, reason: 'not-authenticated' })
    fake.gh = async () => {
      throw ghError('something broke')
    }
    expect(await getLaunchpadData(['/r'])).toMatchObject({ connected: false, reason: 'error', message: 'something broke' })
  })

  it('skips repos that are not on GitHub, and reports other failures per repo', async () => {
    fake.gh = async (cwd, args) => {
      if (args[0] === 'api') return 'ada'
      if (cwd === '/repos/local') throw ghError('no git remotes found')
      if (cwd === '/repos/broken') throw ghError('HTTP 502')
      return '[]'
    }
    const data = await getLaunchpadData(['/repos/ok', '/repos/local', '/repos/broken'])
    expect(data.skippedRepos).toEqual([
      { repoPath: '/repos/local', repoName: 'local', reason: 'not-github' },
      { repoPath: '/repos/broken', repoName: 'broken', reason: 'error', message: 'HTTP 502' }
    ])
  })
})

describe('getLaunchpadData through the API', () => {
  it('uses the signed-in account for its repos and gh for the rest', async () => {
    fake.access.set('/repos/api', access('ada-api'))
    fake.api = async () => ({ authored: [pr(5, { author: { login: 'ada-api' } })], reviewRequested: [] })
    ghAnswers([pr(6)])
    const data = await getLaunchpadData(['/repos/api', '/repos/cli'])
    expect(data.login).toBe('ada-api')
    expect(data.pullRequests.map((p) => [p.number, p.repoName])).toEqual([
      [5, 'api'],
      [6, 'cli']
    ])
  })

  it("doesn't ask gh at all when every repo has an account", async () => {
    fake.access.set('/repos/api', access('ada'))
    const gh = vi.fn(async () => {
      throw ghError('', 'ENOENT')
    })
    fake.gh = gh
    const data = await getLaunchpadData(['/repos/api'])
    expect(data.connected).toBe(true)
    expect(gh).not.toHaveBeenCalled()
  })

  it('explains a rejected token', async () => {
    fake.access.set('/repos/api', access('ada'))
    fake.api = async () => {
      throw new HttpError(401, 'Bad credentials')
    }
    const data = await getLaunchpadData(['/repos/api'])
    expect(data.skippedRepos?.[0].message).toBe('github.com rejected the token for ada. Add it again in Settings.')
  })

  it('still shows API repos when gh is unavailable for the others', async () => {
    fake.access.set('/repos/api', access('ada'))
    fake.api = async () => ({ authored: [pr(5)], reviewRequested: [] })
    fake.gh = async () => {
      throw ghError('', 'ENOENT')
    }
    const data = await getLaunchpadData(['/repos/api', '/repos/cli'])
    expect(data.connected).toBe(true)
    expect(data.pullRequests.map((p) => p.number)).toEqual([5])
    expect(data.skippedRepos).toEqual([
      expect.objectContaining({ repoPath: '/repos/cli', reason: 'error', message: expect.stringMatching(/Add a GitHub token/) })
    ])
  })
})

describe('mergePullRequest', () => {
  it('merges through the API when signed in, otherwise through gh', async () => {
    fake.access.set('/repos/api', access('ada'))
    await mergePullRequest('/repos/api', 4)
    expect(fake.merged).toEqual(['api-repo#4'])

    const gh = vi.fn(async () => '')
    fake.gh = gh
    await mergePullRequest('/repos/cli', 7)
    expect(gh).toHaveBeenCalledWith('/repos/cli', ['pr', 'merge', '7', '--merge'])
  })
})
