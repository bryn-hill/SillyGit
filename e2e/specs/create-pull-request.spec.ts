import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import type { PullRequestDetail } from '../../src/shared/prReview'
import type { FixtureRepo } from '../support/fixtureRepo'

const GITHUB_URL = 'git@github.com:owner/repo.git'

/** Replaces a channel with one that records each call's arguments and answers `result`. */
async function recordIpc(app: ElectronApplication, channel: string, result: unknown): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, { channel, result }) => {
      const g = globalThis as unknown as { ipcCalls?: Record<string, unknown[][]> }
      g.ipcCalls ??= {}
      g.ipcCalls[channel] = []
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, (_e, ...args) => {
        g.ipcCalls![channel].push(args)
        return result
      })
    },
    { channel, result }
  )
}

function recorded(app: ElectronApplication, channel: string): Promise<unknown[][]> {
  return app.evaluate(
    (_electron, channel) => (globalThis as unknown as { ipcCalls: Record<string, unknown[][]> }).ipcCalls[channel],
    channel
  )
}

function detail(number: number, title: string, head: string): PullRequestDetail {
  return {
    repoPath: '',
    number,
    title,
    body: '',
    url: `https://github.com/owner/repo/pull/${number}`,
    author: 'bryn',
    state: 'OPEN',
    isDraft: true,
    headRefName: head,
    baseRefName: 'main',
    headSha: 'abc123',
    mergeable: 'MERGEABLE',
    reviewDecision: 'REVIEW_REQUIRED',
    additions: 1,
    deletions: 0,
    createdAt: '2026-10-30T09:00:00Z',
    viewer: 'bryn',
    checks: [],
    reviews: [],
    comments: [],
    threads: [],
    files: []
  }
}

/**
 * Gives the repo an origin that looks like GitHub (so the app offers pull
 * requests) but pushes to a local bare repo. Returns the bare repo's path.
 */
function addPushableGithubRemote(repo: FixtureRepo, branches: string[]): string {
  const bare = mkdtempSync(join(tmpdir(), 'sillygit-e2e-origin-'))
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  repo.git('remote', 'add', 'origin', GITHUB_URL)
  repo.git('config', `url.${bare}.pushInsteadOf`, GITHUB_URL)
  for (const branch of branches) repo.git('push', '-q', '-u', 'origin', branch)
  return bare
}

const inBare = (bare: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: bare, encoding: 'utf8' }).trim()

test.describe('creating a pull request', () => {
  let bare: string | null = null

  test.afterEach(() => {
    if (bare) rmSync(bare, { recursive: true, force: true })
    bare = null
  })

  test.beforeEach(async ({ electronApp }) => {
    await stubIpc(electronApp, 'git:open-pull-requests', { ok: true, data: [] })
    await stubIpc(electronApp, 'pr:suggested-reviewers', { ok: true, data: ['alice', 'carol'] })
  })

  test('pushes a new branch, opens the pull request and shows it', async ({ sillygit, repo, electronApp }) => {
    bare = addPushableGithubRemote(repo, ['main'])
    repo.git('checkout', '-q', '-b', 'feature/login')
    repo.commitFile('login.ts', 'export {}\n', 'feat: add the login page')
    repo.git('checkout', '-q', 'main')
    await recordIpc(electronApp, 'pr:create', {
      ok: true,
      data: { number: 42, url: 'https://github.com/owner/repo/pull/42', title: 'feat: add the login page' }
    })
    await stubIpc(electronApp, 'pr:get-detail', { ok: true, data: detail(42, 'feat: add the login page', 'feature/login') })
    await stubIpc(electronApp, 'launchpad:get-data', { ok: true, data: { connected: true, login: 'bryn', pullRequests: [] } })
    await sillygit.openRepository(repo.path)

    await sillygit.graph.badge('feature/login').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Start a pull request from feature/login into main…' }).click()

    const dialog = sillygit.createPullRequest
    await expect(dialog.head).toHaveText('feature/login')
    await expect(dialog.base).toHaveText('origin/main')
    await expect(dialog.title).toHaveValue('feat: add the login page')
    await expect(dialog.pushNotice).toContainText("feature/login isn't on origin yet.")
    // It has to be pushed before GitHub can open a pull request from it.
    await expect(dialog.pushFirst).toBeChecked()
    await expect(dialog.pushFirst).toBeDisabled()

    await dialog.title.fill('Add the login page')
    await dialog.description.fill('Adds the login page.')
    await dialog.draft.check()
    await dialog.addSuggestedReviewer('alice')
    await expect(dialog.reviewers).toHaveValue('alice, ')
    await dialog.reviewers.pressSequentially('bo')
    await expect(dialog.reviewers).toHaveValue('alice, bo')
    await expect(dialog.suggestedReviewers).toBeHidden()
    await dialog.reviewers.pressSequentially('b')
    await expect(dialog.createButton).toHaveText('Push and create draft pull request')
    await dialog.createButton.click()

    await expect(dialog.root).toBeHidden()
    expect(inBare(bare, 'rev-parse', 'feature/login')).toBe(repo.git('rev-parse', 'feature/login').trim())
    expect(repo.git('rev-parse', '--abbrev-ref', 'feature/login@{upstream}').trim()).toBe('origin/feature/login')
    expect((await recorded(electronApp, 'pr:create'))[0][1]).toEqual({
      base: 'main',
      head: 'feature/login',
      title: 'Add the login page',
      body: 'Adds the login page.',
      draft: true,
      reviewers: ['alice', 'bob']
    })
    await expect(sillygit.pullRequest.root).toContainText('feat: add the login page #42')
    await expect(sillygit.notice).toContainText('Opened pull request #42.')
  })

  test('a branch with unpushed commits can go up as it is on the remote', async ({ sillygit, repo, electronApp }) => {
    bare = addPushableGithubRemote(repo, ['main'])
    repo.git('checkout', '-q', '-b', 'fix/typo')
    repo.commitFile('a.txt', 'a\n', 'fix: one')
    repo.git('push', '-q', '-u', 'origin', 'fix/typo')
    repo.commitFile('b.txt', 'b\n', 'fix: two')
    const pushed = inBare(bare, 'rev-parse', 'fix/typo')
    await recordIpc(electronApp, 'pr:create', { ok: false, error: 'GitHub is having a moment.' })
    await sillygit.openRepository(repo.path)

    await sillygit.actionsButton.click()
    await sillygit.actions.getByRole('option', { name: 'Create pull request from fix/typo…' }).click()

    const dialog = sillygit.createPullRequest
    await expect(dialog.base).toHaveText('origin/main')
    await expect(dialog.pushNotice).toContainText("fix/typo has 1 commit that origin doesn't have yet.")
    await dialog.pushFirst.uncheck()
    await expect(dialog.createButton).toHaveText('Create pull request')
    await dialog.createButton.click()

    // GitHub's refusal is shown in the dialog, which stays open to try again.
    await expect(dialog.error).toHaveText('GitHub is having a moment.')
    await expect(dialog.root).toBeVisible()
    expect(inBare(bare, 'rev-parse', 'fix/typo')).toBe(pushed)
    expect((await recorded(electronApp, 'pr:create'))[0][1]).toMatchObject({ base: 'main', head: 'fix/typo' })
  })

  test('the base can be changed and the head cannot be the base', async ({ sillygit, repo }) => {
    repo.git('branch', 'develop')
    repo.git('checkout', '-q', '-b', 'feature')
    repo.commitFile('f.txt', 'f\n', 'feat: f')
    repo.git('checkout', '-q', 'main')
    repo.addFakeRemote(GITHUB_URL, ['main', 'develop', 'feature'])
    await sillygit.openRepository(repo.path)

    await sillygit.graph.badge('origin/feature').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Start a pull request from origin/feature into main…' }).click()

    const dialog = sillygit.createPullRequest
    await expect(dialog.head).toHaveText('origin/feature')
    await expect(dialog.pushNotice).toBeHidden()
    await dialog.chooseBase('origin/develop')
    await expect(dialog.createButton).toBeEnabled()
    await dialog.chooseBase('origin/feature')
    await expect(dialog.createButton).toBeDisabled()
    await expect(dialog.createButton).toHaveAttribute('title', /same branch/)
  })
})
