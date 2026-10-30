import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import type { FixtureRepo } from '../support/fixtureRepo'
import type { PullRequestDetail } from '../../src/shared/prReview'
import type { PullRequestHead } from '../../src/shared/prCheckout'
import type { LaunchpadData } from '../../src/shared/types'

// GitHub is stubbed (the pull request list, its detail and where its head
// is); the fetch and checkout are real git against the fixture's origin.
const BRANCH = 'junior/login'
const head: PullRequestHead = {
  number: 7,
  host: 'github.com',
  baseRepo: { owner: 'bryn', name: 'app' },
  headRepo: { owner: 'bryn', name: 'app' },
  headRefName: BRANCH
}

function launchpadFor(repo: FixtureRepo): LaunchpadData {
  return {
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
        headRefName: BRANCH,
        baseRefName: 'main',
        updatedAt: '2026-10-27T09:00:00Z',
        additions: 1,
        deletions: 0,
        bucket: 'needsMyReview',
        repoPath: repo.path,
        repoName: repo.name
      }
    ]
  }
}

function detailFor(repo: FixtureRepo): PullRequestDetail {
  return {
    repoPath: repo.path,
    number: 7,
    title: 'Add login page',
    body: '',
    url: 'https://github.com/bryn/app/pull/7',
    author: 'junior',
    state: 'OPEN',
    isDraft: false,
    headRefName: BRANCH,
    baseRefName: 'main',
    headSha: 'abc123',
    mergeable: 'MERGEABLE',
    reviewDecision: 'REVIEW_REQUIRED',
    additions: 1,
    deletions: 0,
    createdAt: '2026-10-27T09:00:00Z',
    viewer: 'bryn',
    checks: [],
    reviews: [],
    comments: [],
    threads: [],
    files: []
  }
}

const checkedOut = `Checked out #7 as ${BRANCH} (tracking origin/${BRANCH}).`

test.beforeEach(async ({ electronApp, repo }) => {
  repo.addPullRequestRemote(7, BRANCH)
  await stubIpc(electronApp, 'launchpad:get-data', { ok: true, data: launchpadFor(repo) })
  await stubIpc(electronApp, 'pr:get-detail', { ok: true, data: detailFor(repo) })
  await stubIpc(electronApp, 'pr:head', { ok: true, data: head })
  await stubIpc(electronApp, 'git:open-pull-requests', {
    ok: true,
    data: [{ number: 7, url: 'https://github.com/bryn/app/pull/7', headRefName: BRANCH, title: 'Add login page' }]
  })
})

test("a Launchpad card's Check out opens its repo on the pull request's branch", async ({ sillygit, repo }) => {
  // No repo open yet: checking out opens the pull request's repo in a tab.
  await sillygit.tabs.launchpad.click()
  await expect(sillygit.launchpad.card('Add login page')).toBeVisible()
  await sillygit.launchpad.checkoutButton(7).click()

  await expect(sillygit.notice).toHaveText(checkedOut)
  await expect(sillygit.launchpad.root).toBeHidden()
  await expect(sillygit.branchCrumb).toContainText(BRANCH)
  await expect(sillygit.graph.rows.filter({ hasText: `Add pr.txt on ${BRANCH}` })).toBeVisible()
  expect(repo.git('branch', '--show-current').trim()).toBe(BRANCH)
  expect(repo.git('rev-parse', '--abbrev-ref', '@{upstream}').trim()).toBe(`origin/${BRANCH}`)
})

test('the pull request screen checks out the branch, and again switches back to it', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.tabs.launchpad.click()
  await sillygit.launchpad.card('Add login page').getByRole('button', { name: 'Review', exact: true }).click()
  await sillygit.pullRequest.checkoutButton.click()

  await expect(sillygit.notice).toHaveText(checkedOut)
  await expect(sillygit.branchCrumb).toContainText(BRANCH)

  repo.git('checkout', '-q', 'main')
  await expect(sillygit.branchCrumb).toContainText('main')
  await sillygit.tabs.launchpad.click()
  await sillygit.launchpad.checkoutButton(7).click()
  await expect(sillygit.notice).toHaveText(`Switched to ${BRANCH}, already up to date with #7 (tracking origin/${BRANCH}).`)
  expect(repo.git('branch', '--show-current').trim()).toBe(BRANCH)
})

test('the command palette lists open pull requests to check out', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.page.keyboard.press('ControlOrMeta+k')
  await sillygit.page.getByRole('textbox', { name: 'Command' }).fill('#7 add login')
  const palette = sillygit.page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('option', { selected: true })).toContainText(`#7 Add login page (${BRANCH})`)
  await expect(palette.getByRole('option', { selected: true })).toContainText('Check out pull request…')
  await sillygit.page.keyboard.press('Enter')

  await expect(sillygit.notice).toHaveText(checkedOut)
  expect(repo.git('branch', '--show-current').trim()).toBe(BRANCH)
})

test("a pull request the remote doesn't have says so and stays on Launchpad", async ({ sillygit, electronApp, repo }) => {
  await stubIpc(electronApp, 'pr:head', { ok: true, data: { ...head, number: 99 } })
  await sillygit.openRepository(repo.path)
  await sillygit.tabs.launchpad.click()
  await sillygit.launchpad.checkoutButton(7).click()

  await expect(sillygit.errorBanner).toContainText('origin has no refs/pull/99/head')
  await expect(sillygit.launchpad.root).toBeVisible()
  await expect(sillygit.launchpad.checkoutButton(7)).toBeEnabled()
  expect(repo.git('branch', '--show-current').trim()).toBe('main')
})
