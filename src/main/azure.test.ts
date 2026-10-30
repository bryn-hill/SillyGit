import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setFetch } from './http'
import {
  azureAvatarFor,
  azureBucket,
  azureCreatePullRequest,
  azureLaunchpad,
  azurePullRequestDetail,
  azurePullRequestHead,
  azureReplyToThread,
  azureSetThreadResolved,
  azureSubmitReview,
  parseDiffFiles,
  splitThreads,
  verifyAzureAccount,
  votesAsReviews,
  type AzPullRequest,
  type AzThread,
  type AzureAccess
} from './azure'
import type { CreatePullRequestInput } from '../shared/createPullRequest'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

const calls: Call[] = []
type Route = (call: Call) => Response | undefined

function fakeFetch(...routes: Route[]): void {
  setFetch(async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? JSON.parse(init.body as string) : undefined
    }
    calls.push(call)
    for (const route of routes) {
      const res = route(call)
      if (res) return res
    }
    return new Response('not found', { status: 404 })
  })
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const on =
  (method: string, pattern: RegExp, body: unknown | ((call: Call) => unknown), status = 200): Route =>
  (call) =>
    call.method === method && pattern.test(call.url)
      ? json(typeof body === 'function' ? (body as (c: Call) => unknown)(call) : body, status)
      : undefined

// Each test gets a fresh account id, so the per-organization "who am I" cache starts empty.
let accountSeq = 0
const access = (remote = 'origin'): AzureAccess => ({
  repo: { organization: 'contoso', project: 'Web Site', name: 'site' },
  remote,
  creds: { provider: 'azure', host: 'dev.azure.com', token: 'pat', organization: 'contoso' },
  account: {
    id: `acc-${++accountSeq}`,
    provider: 'azure',
    host: 'dev.azure.com',
    username: 'ada@contoso.com',
    organization: 'contoso',
    displayName: 'Ada',
    avatar: null,
    emails: [],
    addedAt: ''
  }
})

const me = on('GET', /\/contoso\/_apis\/connectionData/, {
  authenticatedUser: { id: 'me-id', providerDisplayName: 'Ada', properties: { Account: { $value: 'ada@contoso.com' } } }
})

const pr = (id: number, extra: Partial<AzPullRequest> = {}): AzPullRequest => ({
  pullRequestId: id,
  title: `PR ${id}`,
  status: 'active',
  sourceRefName: 'refs/heads/feature',
  targetRefName: 'refs/heads/main',
  createdBy: { id: 'me-id', displayName: 'Ada' },
  creationDate: '2026-10-29T10:00:00Z',
  reviewers: [],
  ...extra
})

beforeEach(() => {
  calls.length = 0
})

describe('verifyAzureAccount', () => {
  it('reads who the token belongs to in the organization, with an authenticated avatar', async () => {
    fakeFetch(me, on('GET', /profiles\/me/, { emailAddress: 'Ada.Lovelace@Contoso.com' }))
    const v = await verifyAzureAccount({ provider: 'azure', host: 'dev.azure.com', token: 'pat', organization: 'contoso' })
    expect(v).toMatchObject({
      username: 'ada@contoso.com',
      displayName: 'Ada',
      emails: ['ada@contoso.com', 'ada.lovelace@contoso.com'],
      avatarUrl: 'https://dev.azure.com/contoso/_api/_common/identityImage?id=me-id&size=2'
    })
    expect(v.avatarHeaders?.Authorization).toBe(`Basic ${Buffer.from(':pat').toString('base64')}`)
    expect(calls[0].headers.Authorization).toBe(`Basic ${Buffer.from(':pat').toString('base64')}`)
    expect(calls[0].url).toContain('api-version=7.1')
  })

  it('treats the sign-in page Azure DevOps sends for a bad token as a 401', async () => {
    fakeFetch(() => new Response('<html>sign in</html>', { status: 203, headers: { 'content-type': 'text/html' } }))
    await expect(
      verifyAzureAccount({ provider: 'azure', host: 'dev.azure.com', token: 'bad', organization: 'contoso' })
    ).rejects.toThrow(/401/)
  })

  it('refuses the anonymous user an organization reports without a usable token', async () => {
    fakeFetch(on('GET', /connectionData/, { authenticatedUser: { id: 'anon', providerDisplayName: 'Anonymous' } }))
    await expect(
      verifyAzureAccount({ provider: 'azure', host: 'dev.azure.com', token: 'x', organization: 'contoso' })
    ).rejects.toThrow(/not accepted/)
  })

  it('says when the organization does not exist', async () => {
    fakeFetch()
    await expect(
      verifyAzureAccount({ provider: 'azure', host: 'dev.azure.com', token: 'x', organization: 'nope' })
    ).rejects.toThrow(/no organization called nope/)
  })
})

describe('Launchpad', () => {
  it('sorts pull requests into buckets from their votes and merge status', () => {
    expect(azureBucket(pr(1, { isDraft: true }), 'me-id', true)).toBe('draft')
    expect(azureBucket(pr(1), 'me-id', false)).toBe('needsMyReview')
    expect(azureBucket(pr(1, { mergeStatus: 'conflicts' }), 'me-id', true)).toBe('conflicts')
    expect(azureBucket(pr(1), 'me-id', true)).toBe('unassignedReviewers')
    const reviewer = (vote: number, id = 'bob'): NonNullable<AzPullRequest['reviewers']>[number] => ({
      id,
      displayName: id,
      vote
    })
    expect(azureBucket(pr(1, { reviewers: [reviewer(0)] }), 'me-id', true)).toBe('waitingForReview')
    expect(azureBucket(pr(1, { reviewers: [reviewer(10), reviewer(5, 'cy')] }), 'me-id', true)).toBe('readyToMerge')
    expect(azureBucket(pr(1, { reviewers: [reviewer(10), reviewer(-5, 'cy')] }), 'me-id', true)).toBe('changesRequested')
    // The author's own vote doesn't count.
    expect(azureBucket(pr(1, { reviewers: [reviewer(10, 'me-id')] }), 'me-id', true)).toBe('unassignedReviewers')
  })

  it('lists the user’s own pull requests and the ones they review, once each', async () => {
    fakeFetch(
      me,
      on('GET', /pullrequests\?.*creatorId=me-id/, { value: [pr(1, { reviewers: [{ id: 'bob', displayName: 'Bob', vote: 10 }] })] }),
      on('GET', /pullrequests\?.*reviewerId=me-id/, {
        value: [pr(1), pr(2, { createdBy: { id: 'bob', displayName: 'Bob' }, sourceRefName: 'refs/heads/fix/x' })]
      })
    )
    const list = await azureLaunchpad(access(), '/repos/site')
    expect(list.map((p) => [p.number, p.bucket, p.isMine, p.author, p.headRefName])).toEqual([
      [1, 'readyToMerge', true, 'Ada', 'feature'],
      [2, 'needsMyReview', false, 'Bob', 'fix/x']
    ])
    expect(list[0]).toMatchObject({
      url: 'https://dev.azure.com/contoso/Web%20Site/_git/site/pullrequest/1',
      provider: 'azure',
      repoName: 'site'
    })
    expect(calls[1].url).toContain('/contoso/Web%20Site/_apis/git/repositories/site/pullrequests?')
    expect(calls[1].url).toContain('searchCriteria.status=active')
  })

  it('explains a token Azure DevOps no longer accepts', async () => {
    fakeFetch(() => new Response('', { status: 401 }))
    await expect(azureLaunchpad(access(), '/repos/site')).rejects.toThrow(/rejected the token for ada@contoso.com in contoso/)
  })
})

describe('review threads', () => {
  const comment = (id: number, content: string, at: string, extra = {}): AzThread['comments'][number] => ({
    id,
    author: { id: 'bob', displayName: 'Bob' },
    content,
    publishedDate: at,
    commentType: 'text',
    ...extra
  })

  it('splits conversation comments from line threads and skips system notes', () => {
    const threads: AzThread[] = [
      { id: 1, status: 'active', comments: [comment(1, 'Looks good', '2026-10-29T12:00:00Z'), comment(2, 'Thanks', '2026-10-29T13:00:00Z')] },
      {
        id: 2,
        status: 'fixed',
        threadContext: { filePath: '/src/app.ts', rightFileStart: { line: 3, offset: 1 }, rightFileEnd: { line: 5, offset: 1 } },
        comments: [comment(3, 'Rename this', '2026-10-29T11:00:00Z')]
      },
      {
        id: 3,
        threadContext: { filePath: '/old.ts', leftFileStart: { line: 9, offset: 1 }, leftFileEnd: { line: 9, offset: 4 } },
        comments: [comment(4, 'Why remove?', '2026-10-29T11:30:00Z')]
      },
      { id: 4, comments: [comment(5, 'Ada voted 10', '2026-10-29T10:00:00Z', { commentType: 'system' })] },
      { id: 5, isDeleted: true, comments: [comment(6, 'gone', '2026-10-29T10:00:00Z')] }
    ]
    const split = splitThreads(7, threads)
    expect(split.comments.map((c) => c.body)).toEqual(['Looks good', 'Thanks'])
    expect(split.threads).toEqual([
      expect.objectContaining({ id: '7:2', path: 'src/app.ts', line: 5, startLine: 3, side: 'RIGHT', isResolved: true }),
      expect.objectContaining({ id: '7:3', path: 'old.ts', line: 9, startLine: null, side: 'LEFT', isResolved: false })
    ])
  })

  it('turns votes into reviews, timed by the vote notes', () => {
    const reviews = votesAsReviews(
      [
        { id: 'bob', displayName: 'Bob', vote: 10 },
        { id: 'cy', displayName: 'Cy', vote: -5 },
        { id: 'di', displayName: 'Di', vote: 0 }
      ],
      [
        {
          id: 9,
          publishedDate: '2026-10-29T14:00:00Z',
          properties: { CodeReviewThreadType: { $value: 'VoteUpdate' }, CodeReviewVotedByIdentity: { $value: 'bob' } },
          comments: []
        }
      ]
    )
    expect(reviews).toEqual([
      { id: 'bob', author: 'Bob', state: 'APPROVED', body: 'Approved', submittedAt: '2026-10-29T14:00:00Z' },
      { id: 'cy', author: 'Cy', state: 'CHANGES_REQUESTED', body: 'Waiting for author', submittedAt: '' }
    ])
  })

  it('replies to and resolves a thread by its pull request and thread ids', async () => {
    fakeFetch(on('POST', /threads\/4\/comments/, {}), on('PATCH', /threads\/4/, {}))
    await azureReplyToThread(access(), '12:4', 'Done')
    await azureSetThreadResolved(access(), '12:4', true)
    await azureSetThreadResolved(access(), '12:4', false)
    expect(calls.map((c) => [c.method, c.url.replace(/\?.*/, '').replace(/^.*repositories\/site\//, ''), c.body])).toEqual([
      ['POST', 'pullRequests/12/threads/4/comments', { content: 'Done', parentCommentId: 1, commentType: 1 }],
      ['PATCH', 'pullRequests/12/threads/4', { status: 'fixed' }],
      ['PATCH', 'pullRequests/12/threads/4', { status: 'active' }]
    ])
  })
})

describe('submitting a review', () => {
  it('posts each line comment as a thread, then the summary, then the vote', async () => {
    fakeFetch(me, on('POST', /threads/, {}), on('PUT', /reviewers\/me-id/, {}))
    await azureSubmitReview(access(), 12, {
      headSha: 'abc',
      event: 'REQUEST_CHANGES',
      body: 'A couple of things',
      comments: [
        { id: 'd1', path: 'src/a.ts', line: 7, side: 'RIGHT', startLine: 5, body: 'Range' },
        { id: 'd2', path: 'src/b.ts', line: 2, side: 'LEFT', body: 'Removed line' }
      ]
    })
    const posts = calls.filter((c) => c.method !== 'GET')
    expect(posts.map((c) => c.body)).toEqual([
      {
        comments: [{ parentCommentId: 0, content: 'Range', commentType: 1 }],
        status: 'active',
        threadContext: { filePath: '/src/a.ts', rightFileStart: { line: 5, offset: 1 }, rightFileEnd: { line: 7, offset: 1 } }
      },
      {
        comments: [{ parentCommentId: 0, content: 'Removed line', commentType: 1 }],
        status: 'active',
        threadContext: { filePath: '/src/b.ts', leftFileStart: { line: 2, offset: 1 }, leftFileEnd: { line: 2, offset: 1 } }
      },
      { comments: [{ parentCommentId: 0, content: 'A couple of things', commentType: 1 }], status: 'active' },
      { vote: -5 }
    ])
  })

  it('sends no vote for a plain comment', async () => {
    fakeFetch(me, on('POST', /threads/, {}))
    await azureSubmitReview(access(), 12, { headSha: 'abc', event: 'COMMENT', body: 'Hi', comments: [] })
    expect(calls.map((c) => c.method)).toEqual(['POST'])
  })
})

describe('creating a pull request', () => {
  const input: CreatePullRequestInput = {
    base: 'main',
    head: 'feature/x',
    title: ' Add x ',
    body: 'Body',
    draft: true,
    reviewers: ['bob@contoso.com', 'Nobody']
  }
  const team = [
    on('GET', /_apis\/projects\/Web%20Site\?/, { defaultTeam: { id: 'team-1' } }),
    on('GET', /teams\/team-1\/members/, {
      value: [
        { identity: { id: 'bob-id', displayName: 'Bob', uniqueName: 'bob@contoso.com' } },
        { identity: { id: 'me-id', displayName: 'Ada', uniqueName: 'ada@contoso.com' } },
        { identity: { id: 'grp', displayName: '[Web]\\Readers', isContainer: true } }
      ]
    })
  ]

  it('opens it, adds reviewers by email, and reports the ones it could not find', async () => {
    fakeFetch(
      on('POST', /repositories\/site\/pullrequests\?/, (c: Call) => ({ ...pr(31), title: (c.body as { title: string }).title })),
      ...team,
      on('GET', /vssps\.dev\.azure\.com\/contoso\/_apis\/identities/, { value: [] }),
      on('PUT', /pullRequests\/31\/reviewers\/bob-id/, {})
    )
    const created = await azureCreatePullRequest(access(), input, [42])
    expect(created).toMatchObject({
      number: 31,
      url: 'https://dev.azure.com/contoso/Web%20Site/_git/site/pullrequest/31',
      title: 'Add x'
    })
    expect(created.reviewersError).toMatch(/Couldn't add Nobody \(no one called Nobody in contoso\)/)
    expect(calls[0].body).toEqual({
      sourceRefName: 'refs/heads/feature/x',
      targetRefName: 'refs/heads/main',
      title: 'Add x',
      description: 'Body',
      isDraft: true,
      workItemRefs: [{ id: '42' }]
    })
  })

  it('says so when a pull request between the branches already exists', async () => {
    fakeFetch(
      on('POST', /pullrequests/, { message: 'TF401179: An active pull request for the source and target branch already exists.' }, 409)
    )
    await expect(azureCreatePullRequest(access(), { ...input, reviewers: [] })).rejects.toThrow(
      "There's already an open pull request from feature/x into main."
    )
  })
})

describe('parseDiffFiles', () => {
  it('pairs name-status entries with their hunks', () => {
    const nameStatus = ['M', 'a.ts', 'R087', 'old name.ts', 'new name.ts', 'A', 'logo.png', 'D', 'gone.txt', ''].join('\0')
    const diff = [
      'diff --git a/a.ts b/a.ts',
      'index 1..2 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,2 @@',
      ' keep',
      '-old',
      '+new',
      'diff --git a/old name.ts b/new name.ts',
      'similarity index 87%',
      'rename from old name.ts',
      'rename to new name.ts',
      '@@ -3 +3,2 @@',
      '+added',
      ' same',
      'diff --git a/logo.png b/logo.png',
      'new file mode 100644',
      'Binary files /dev/null and b/logo.png differ',
      'diff --git a/gone.txt b/gone.txt',
      'deleted file mode 100644',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-bye',
      ''
    ].join('\n')
    expect(parseDiffFiles(nameStatus, diff)).toEqual([
      { status: 'modified', path: 'a.ts', additions: 1, deletions: 1, patch: '@@ -1,2 +1,2 @@\n keep\n-old\n+new' },
      { status: 'renamed', path: 'new name.ts', previousPath: 'old name.ts', additions: 1, deletions: 0, patch: '@@ -3 +3,2 @@\n+added\n same' },
      { status: 'added', path: 'logo.png', additions: 0, deletions: 0, patch: null },
      { status: 'removed', path: 'gone.txt', additions: 0, deletions: 1, patch: '@@ -1 +0,0 @@\n-bye' }
    ])
  })
})

describe('with a real repository', () => {
  let root: string
  let work: string
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sillygit-azure-'))
    const origin = join(root, 'origin.git')
    const author = join(root, 'author')
    work = join(root, 'work')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
    execFileSync('git', ['init', '-q', '-b', 'main', author])
    git(author, 'config', 'user.email', 'a@example.com')
    git(author, 'config', 'user.name', 'A')
    writeFileSync(join(author, 'app.ts'), 'one\ntwo\n')
    git(author, 'add', '.')
    git(author, 'commit', '-q', '-m', 'init')
    git(author, 'push', '-q', origin, 'main')
    execFileSync('git', ['clone', '-q', origin, work])
    git(author, 'checkout', '-q', '-b', 'feature')
    writeFileSync(join(author, 'app.ts'), 'one\n2\n')
    writeFileSync(join(author, 'new.ts'), 'hello\n')
    git(author, 'add', '.')
    git(author, 'commit', '-q', '-m', 'change')
    git(author, 'push', '-q', origin, 'feature')
    // main moves on after the branch forked; that mustn't show in the pull request.
    git(author, 'checkout', '-q', 'main')
    writeFileSync(join(author, 'later.ts'), 'later\n')
    git(author, 'add', '.')
    git(author, 'commit', '-q', '-m', 'later')
    git(author, 'push', '-q', origin, 'main')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('fetches the branches and diffs the pull request from where it forked', async () => {
    fakeFetch(
      me,
      on('GET', /pullrequests\/5\?/, pr(5, { description: 'Why', reviewers: [{ id: 'bob', displayName: 'Bob', vote: 10 }] })),
      on('GET', /pullRequests\/5\/threads/, { value: [] }),
      on('GET', /pullRequests\/5\/statuses/, { value: [{ state: 'failed', context: { genre: 'ci', name: 'lint' }, targetUrl: 'u' }] })
    )
    const detail = await azurePullRequestDetail(access(), work, 5)
    expect(detail.files.map((f) => [f.path, f.status, f.additions, f.deletions])).toEqual([
      ['app.ts', 'modified', 1, 1],
      ['new.ts', 'added', 1, 0]
    ])
    expect(detail).toMatchObject({
      number: 5,
      body: 'Why',
      author: 'Ada',
      viewer: 'Ada',
      state: 'OPEN',
      headRefName: 'feature',
      baseRefName: 'main',
      reviewDecision: 'APPROVED',
      additions: 2,
      deletions: 1,
      provider: 'azure',
      checks: [{ name: 'ci/lint', state: 'failure', url: 'u' }]
    })
  })

  it('checks out a pull request from its source branch on the same remote', async () => {
    fakeFetch(on('GET', /pullrequests\/5\?/, pr(5)))
    const head = await azurePullRequestHead(access(), 5)
    expect(head).toMatchObject({ remote: 'origin', fetchRef: 'refs/heads/feature', headRefName: 'feature' })
    const { checkoutPullRequestHead } = await import('./prCheckout')
    const result = await checkoutPullRequestHead(work, head)
    expect(result).toMatchObject({ branch: 'feature', created: true, upstream: 'origin/feature' })
    expect(git(work, 'branch', '--show-current')).toBe('feature')
  })
})

describe('azureAvatarFor', () => {
  it('finds the identity behind an email and asks for its picture with the token', async () => {
    fakeFetch(on('GET', /identities\?searchFilter=MailAddress&filterValue=bob%40contoso.com/, { value: [{ id: 'bob-id' }] }))
    const found = await azureAvatarFor(access().creds, 'contoso', 'bob@contoso.com')
    expect(found?.url).toBe('https://dev.azure.com/contoso/_api/_common/identityImage?id=bob-id&size=2')
    expect(found?.headers.Authorization).toMatch(/^Basic /)
  })
})

