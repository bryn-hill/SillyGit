import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import type { FixtureRepo } from '../support/fixtureRepo'
import type { ElectronApplication } from '@playwright/test'
import type { LaunchpadData } from '../../src/shared/types'

/** Launchpad with one issue assigned to the user, in the fixture repo. */
async function stubAssignedIssue(app: ElectronApplication, repo: FixtureRepo): Promise<void> {
  const data: LaunchpadData = {
    connected: true,
    login: 'bryn',
    pullRequests: [],
    issues: [
      {
        number: 12,
        title: 'Export button does nothing on Safari',
        url: 'https://github.com/owner/repo/issues/12',
        author: 'carol',
        labels: [{ name: 'bug', color: 'd73a4a' }],
        updatedAt: '2026-10-29T09:00:00Z',
        repoPath: repo.path,
        repoName: 'repo'
      }
    ]
  }
  await stubIpc(app, 'launchpad:get-data', { ok: true, data })
}

test('Start work on an assigned issue branches off main and checks it out', async ({ sillygit, repo, electronApp }) => {
  repo.addFeatureBranch('feature')
  repo.git('checkout', '-q', 'feature')
  await stubAssignedIssue(electronApp, repo)
  await sillygit.openRepository(repo.path)

  await sillygit.tabs.launchpad.click()
  const issue = sillygit.launchpad.issue('Export button does nothing on Safari')
  await expect(issue).toContainText('repo · #12 · carol')
  await expect(issue).toContainText('bug')

  await sillygit.launchpad.startWorkOn('Export button does nothing on Safari')
  await expect(sillygit.launchpad.branchName).toHaveValue('12-export-button-does-nothing-on-safari')
  await expect(sillygit.launchpad.startWork).toContainText('Branches from main.')
  await expect(sillygit.launchpad.stackOn('feature')).not.toBeChecked()
  await sillygit.launchpad.startButton.click()

  await expect(sillygit.launchpad.startWork).toHaveCount(0)
  await expect(sillygit.notice).toContainText('Working on #12 on 12-export-button-does-nothing-on-safari (created).')
  await expect(sillygit.branchCrumb).toContainText('12-export-button-does-nothing-on-safari')
  expect(repo.git('symbolic-ref', '--short', 'HEAD').trim()).toBe('12-export-button-does-nothing-on-safari')
  expect(repo.git('rev-parse', 'HEAD').trim()).toBe(repo.git('rev-parse', 'main').trim())
  expect(repo.git('config', 'branch.12-export-button-does-nothing-on-safari.sillygit-issue').trim()).toBe('12')
})

test('Start work can stack the new branch on the one checked out', async ({ sillygit, repo, electronApp }) => {
  repo.addFeatureBranch('feature')
  repo.git('checkout', '-q', 'feature')
  await stubAssignedIssue(electronApp, repo)
  await sillygit.openRepository(repo.path)

  await sillygit.tabs.launchpad.click()
  await sillygit.launchpad.startWorkOn('Export button does nothing on Safari')
  await sillygit.launchpad.branchName.fill('12-safari-export')
  await sillygit.launchpad.stackOn('feature').check()
  await expect(sillygit.launchpad.startWork).toContainText('Branches from feature and restacks with it.')
  await sillygit.launchpad.startButton.click()

  await expect(sillygit.notice).toContainText('Working on #12 on 12-safari-export (stacked on feature).')
  const stack = sillygit.sidebar.root.getByRole('group', { name: 'Stack 12-safari-export' })
  await expect(stack).toContainText('on feature')
  expect(repo.git('rev-parse', 'HEAD').trim()).toBe(repo.git('rev-parse', 'feature').trim())
})

test('the pull request for an issue branch closes the issue', async ({ sillygit, repo, electronApp }) => {
  await stubAssignedIssue(electronApp, repo)
  await sillygit.openRepository(repo.path)
  await sillygit.tabs.launchpad.click()
  await sillygit.launchpad.startWorkOn('Export button does nothing on Safari')
  await sillygit.launchpad.branchName.fill('12-safari-export')
  await sillygit.launchpad.startButton.click()
  await expect(sillygit.notice).toContainText('Working on #12')

  repo.commitFile('export.ts', 'export {}\n', 'fix: export on safari')
  repo.addFakeRemote('git@github.com:owner/repo.git', ['main', '12-safari-export'])
  // The menu offers a pull request into the branch checked out.
  repo.git('checkout', '-q', 'main')
  await expect(sillygit.branchCrumb).toContainText('main')
  await sillygit.graph.badge('origin/12-safari-export').click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: /^Start a pull request/ }).click()

  await expect(sillygit.createPullRequest.title).toHaveValue('fix: export on safari')
  await expect(sillygit.createPullRequest.description).toHaveValue('Closes #12')
})
