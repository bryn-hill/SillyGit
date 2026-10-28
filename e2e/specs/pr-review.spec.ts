import type { ElectronApplication } from '@playwright/test'
import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import type { PullRequestDetail } from '../../src/shared/prReview'
import type { LaunchpadData } from '../../src/shared/types'

const REPO = '/work/app'

const launchpad: LaunchpadData = {
  connected: true,
  login: 'bryn',
  pullRequests: [
    {
      number: 7,
      title: 'Add login page',
      url: 'https://github.com/bryn/app/pull/7',
      author: 'junior',
      isMine: false,
      isDraft: false,
      headRefName: 'junior/login',
      baseRefName: 'main',
      updatedAt: '2026-10-27T09:00:00Z',
      additions: 5,
      deletions: 1,
      bucket: 'needsMyReview',
      repoPath: REPO,
      repoName: 'app'
    }
  ]
}

const detail: PullRequestDetail = {
  repoPath: REPO,
  number: 7,
  title: 'Add login page',
  body: 'Adds the login page.\n\nCloses #3',
  url: 'https://github.com/bryn/app/pull/7',
  author: 'junior',
  state: 'OPEN',
  isDraft: false,
  headRefName: 'junior/login',
  baseRefName: 'main',
  headSha: 'abc123',
  mergeable: 'MERGEABLE',
  reviewDecision: 'REVIEW_REQUIRED',
  additions: 5,
  deletions: 1,
  createdAt: '2026-10-27T09:00:00Z',
  viewer: 'bryn',
  checks: [
    { name: 'unit tests', state: 'failure', description: '2 failed', url: 'https://ci.example/1' },
    { name: 'lint', state: 'success' }
  ],
  reviews: [{ id: 'R1', author: 'carol', state: 'COMMENTED', body: 'Looks close to me', submittedAt: '2026-10-27T10:00:00Z' }],
  comments: [{ id: 'C1', author: 'junior', body: 'Ready for another look', createdAt: '2026-10-27T11:00:00Z' }],
  threads: [
    {
      id: 'T1',
      path: 'src/login.ts',
      line: 2,
      startLine: null,
      side: 'RIGHT',
      isResolved: false,
      isOutdated: false,
      comments: [{ id: 'TC1', author: 'carol', body: 'Rename this to submitLogin', createdAt: '2026-10-27T10:00:00Z' }]
    }
  ],
  files: [
    {
      path: 'src/login.ts',
      status: 'modified',
      additions: 4,
      deletions: 1,
      patch: '@@ -1,3 +1,6 @@\n import { api } from "./api"\n-export function login() {}\n+export function login(user: string) {\n+  return api.post("/login", { user })\n+}\n+export const TIMEOUT = 5\n const x = 1'
    },
    { path: 'logo.png', status: 'added', additions: 0, deletions: 0, patch: null }
  ]
}

/** Replaces a channel with a handler that records each call's arguments and succeeds. */
async function recordIpc(app: ElectronApplication, channel: string): Promise<void> {
  await app.evaluate(({ ipcMain }, channel) => {
    const g = globalThis as unknown as { ipcCalls?: Record<string, unknown[][]> }
    g.ipcCalls ??= {}
    g.ipcCalls[channel] = []
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_e, ...args) => {
      g.ipcCalls![channel].push(args)
      return { ok: true, data: undefined }
    })
  }, channel)
}

function recorded(app: ElectronApplication, channel: string): Promise<unknown[][]> {
  return app.evaluate((_electron, channel) => (globalThis as unknown as { ipcCalls: Record<string, unknown[][]> }).ipcCalls[channel], channel)
}

test.beforeEach(async ({ electronApp }) => {
  await stubIpc(electronApp, 'launchpad:get-data', { ok: true, data: launchpad })
  await stubIpc(electronApp, 'pr:get-detail', { ok: true, data: detail })
  for (const channel of ['pr:submit-review', 'pr:add-comment', 'pr:reply-to-thread', 'pr:set-thread-resolved'])
    await recordIpc(electronApp, channel)
})

test('a pull request opens from Launchpad with its description, checks and conversation', async ({ sillygit }) => {
  await sillygit.tabs.launchpad.click()
  await sillygit.page.getByRole('button', { name: 'Review', exact: true }).click()

  const pr = sillygit.pullRequest
  await expect(pr.root).toContainText('Add login page #7')
  await expect(pr.root).toContainText('junior wants to merge junior/login into main')
  await expect(pr.root).toContainText('Closes #3')
  await expect(pr.checks).toContainText('1 failing, 1 passed')
  await expect(pr.checks).toContainText('unit tests')
  await expect(pr.root).toContainText('Looks close to me')
  await expect(pr.root).toContainText('Ready for another look')
  await expect(pr.root).toContainText('1 unresolved conversation')

  await pr.backButton.click()
  await expect(sillygit.page.getByText('Needs my review')).toBeVisible()
})

test('line comments are drafted on the diff and sent with the review', async ({ sillygit, electronApp }) => {
  // Many clicks, and with the window hidden (a local run) each one waits for frames.
  test.slow()
  await sillygit.tabs.launchpad.click()
  await sillygit.page.getByText('Add login page').click()
  const pr = sillygit.pullRequest
  await pr.filesTab.click()

  await expect(pr.file('src/login.ts')).toHaveAttribute('aria-selected', 'true')
  await expect(pr.threads).toContainText('Rename this to submitLogin')
  await expect(pr.file('src/login.ts')).toContainText('1')

  // Nothing to say yet, so Submit waits for a comment.
  await expect(pr.submitButton).toBeDisabled()

  await pr.commentOnLine('LEFT', 2, 'Why drop the old signature?')
  await pr.commentOnLine('RIGHT', 4, 'Handle the error here', 3)
  await expect(pr.drafts).toHaveCount(2)
  await expect(pr.drafts.nth(1)).toContainText('lines 3–4')
  await expect(pr.submitButton).toHaveText('Submit review (2 pending)')

  // A binary file has no diff to comment on.
  await pr.file('logo.png').click()
  await expect(pr.diff).toContainText('GitHub has no diff for this file')
  await pr.file('src/login.ts').click()

  await pr.verdict('Request changes').click()
  await pr.summary.fill('A couple of things before this goes in.')
  await pr.submitButton.click()
  await expect(pr.banner).toContainText('Review sent: Request changes with 2 line comments.')
  await expect(pr.drafts).toHaveCount(0)

  const [[repoPath, number, input]] = await recorded(electronApp, 'pr:submit-review')
  expect(repoPath).toBe(REPO)
  expect(number).toBe(7)
  expect(input).toMatchObject({
    headSha: 'abc123',
    event: 'REQUEST_CHANGES',
    body: 'A couple of things before this goes in.',
    comments: [
      { path: 'src/login.ts', side: 'LEFT', line: 2, body: 'Why drop the old signature?' },
      { path: 'src/login.ts', side: 'RIGHT', line: 4, startLine: 3, body: 'Handle the error here' }
    ]
  })
})

test('threads can be replied to and resolved, and the conversation commented on', async ({ sillygit, electronApp }) => {
  await sillygit.tabs.launchpad.click()
  await sillygit.page.getByRole('button', { name: 'Review', exact: true }).click()
  const pr = sillygit.pullRequest

  await pr.root.getByPlaceholder('Add a comment to the conversation').fill('Thanks, looking now')
  await pr.root.getByRole('button', { name: 'Comment', exact: true }).first().click()
  await expect(pr.banner).toContainText('Comment added.')
  expect(await recorded(electronApp, 'pr:add-comment')).toEqual([[REPO, 7, 'Thanks, looking now']])

  await pr.filesTab.click()
  await pr.threads.getByRole('button', { name: 'Reply…' }).click()
  await pr.threads.getByPlaceholder('Reply…').fill('Agreed')
  await pr.threads.getByRole('button', { name: 'Reply', exact: true }).click()
  await pr.threads.getByRole('button', { name: 'Resolve' }).click()
  await expect.poll(() => recorded(electronApp, 'pr:set-thread-resolved')).toEqual([[REPO, 'T1', true]])
  expect(await recorded(electronApp, 'pr:reply-to-thread')).toEqual([[REPO, 'T1', 'Agreed']])
})

test("only commenting is offered on the viewer's own pull request", async ({ sillygit, electronApp }) => {
  await stubIpc(electronApp, 'pr:get-detail', { ok: true, data: { ...detail, author: 'bryn' } })
  await sillygit.tabs.launchpad.click()
  await sillygit.page.getByRole('button', { name: 'Review', exact: true }).click()
  const pr = sillygit.pullRequest
  await expect(pr.verdict('Approve')).toBeDisabled()
  await expect(pr.verdict('Request changes')).toBeDisabled()
  await expect(pr.verdict('Comment')).toHaveAttribute('aria-checked', 'true')
})
