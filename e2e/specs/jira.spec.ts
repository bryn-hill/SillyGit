import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import type { ElectronApplication } from '@playwright/test'
import type { JiraIssues, JiraSite } from '../../src/shared/jira'

const SITES: JiraSite[] = [{ host: 'acme.atlassian.net', projectKeys: ['PROJ'] }]

/** One Jira site with one issue assigned to the user; the network and keychain stay out of it. */
async function stubJira(app: ElectronApplication): Promise<void> {
  const issues: JiraIssues = {
    connected: true,
    issues: [
      {
        key: 'PROJ-7',
        summary: 'Log in with SSO',
        url: 'https://acme.atlassian.net/browse/PROJ-7',
        host: 'acme.atlassian.net',
        status: 'In Progress',
        statusCategory: 'indeterminate',
        type: 'Story',
        priority: 'High',
        updatedAt: '2026-10-29T09:00:00Z'
      }
    ],
    problems: []
  }
  await stubIpc(app, 'jira:assigned-issues', { ok: true, data: issues })
  await stubIpc(app, 'jira:sites', { ok: true, data: SITES })
  await stubIpc(app, 'launchpad:get-data', { ok: true, data: { connected: true, login: 'bryn', pullRequests: [], issues: [] } })
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('shell:open-external')
    ipcMain.handle('shell:open-external', (_e, url: string) => {
      ;(globalThis as { openedUrl?: string }).openedUrl = url
      return { ok: true, data: undefined }
    })
  })
}

const openedUrl = (app: ElectronApplication): Promise<string | undefined> =>
  app.evaluate(() => (globalThis as { openedUrl?: string }).openedUrl)

test('a Jira site can be added in Settings', async ({ sillygit, electronApp }) => {
  await stubIpc(electronApp, 'accounts:storage-problem', null)
  await stubIpc(electronApp, 'accounts:list', { ok: true, data: [] })
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('accounts:add')
    ipcMain.handle('accounts:add', (_e, input: Record<string, string>) => {
      ;(globalThis as { added?: unknown }).added = input
      return {
        ok: true,
        data: {
          id: 'jira-1',
          provider: 'jira',
          host: input.host,
          username: input.username,
          displayName: 'Bryn Hill',
          avatar: null,
          emails: [],
          addedAt: '2026-10-30T00:00:00Z'
        }
      }
    })
  })

  await sillygit.settings.open()
  await sillygit.settings.addAccountButton.click()
  await sillygit.settings.service('Jira').click()
  await expect(sillygit.settings.hostInput).toHaveValue('')
  await expect(sillygit.settings.hostInput).toHaveAttribute('placeholder', 'your-site.atlassian.net')
  await sillygit.settings.hostInput.fill('https://acme.atlassian.net/jira/your-work')
  await sillygit.settings.emailInput.fill('bryn@example.com')
  await sillygit.settings.addToken('atl_token')

  await expect(sillygit.settings.account('Bryn Hill')).toContainText('Jira · bryn@example.com · acme.atlassian.net')
  expect(await electronApp.evaluate(() => (globalThis as { added?: unknown }).added)).toEqual({
    provider: 'jira',
    host: 'acme.atlassian.net',
    username: 'bryn@example.com',
    token: 'atl_token'
  })
})

test('Start work on a Jira issue names the branch after its key', async ({ sillygit, repo, electronApp }) => {
  await stubJira(electronApp)
  await sillygit.openRepository(repo.path)

  await sillygit.tabs.launchpad.click()
  const issue = sillygit.launchpad.jiraIssue('PROJ-7')
  await expect(issue).toContainText('Log in with SSO')
  await expect(issue).toContainText('PROJ-7 · Story · High')
  await expect(issue).toContainText('In Progress')

  await sillygit.launchpad.startWorkOnJira('PROJ-7')
  await expect(sillygit.launchpad.repository).toContainText('repo')
  await expect(sillygit.launchpad.branchName).toHaveValue('PROJ-7-log-in-with-sso')
  await expect(sillygit.launchpad.startWork).toContainText('Branches from main. Its pull request will name PROJ-7.')
  await sillygit.launchpad.startButton.click()

  await expect(sillygit.notice).toContainText('Working on PROJ-7 on PROJ-7-log-in-with-sso (created).')
  expect(repo.git('symbolic-ref', '--short', 'HEAD').trim()).toBe('PROJ-7-log-in-with-sso')
  expect(repo.git('config', 'branch.PROJ-7-log-in-with-sso.sillygit-jira-issue').trim()).toBe('PROJ-7')
})

test('Jira keys in commit messages and branch names link to the issue', async ({ sillygit, repo, electronApp }) => {
  await stubJira(electronApp)
  repo.git('checkout', '-q', '-b', 'feature/proj-7-sso')
  repo.commitFile('sso.ts', 'export {}\n', 'feat: PROJ-7 sign in with SSO, not UTF-8')
  await sillygit.openRepository(repo.path)

  // The checked-out commit is selected on open.
  await sillygit.details.expectCommit('feat: PROJ-7 sign in with SSO, not UTF-8')
  const link = sillygit.details.subject.getByRole('link', { name: 'PROJ-7' })
  await expect(link).toHaveAttribute('href', 'https://acme.atlassian.net/browse/PROJ-7')
  await expect(sillygit.details.subject.getByRole('link')).toHaveCount(1)
  await link.click()
  await expect.poll(() => openedUrl(electronApp)).toBe('https://acme.atlassian.net/browse/PROJ-7')

  await electronApp.evaluate(() => delete (globalThis as { openedUrl?: string }).openedUrl)
  await sillygit.graph.badge('feature/proj-7-sso').click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: 'Open PROJ-7 in Jira' }).click()
  await expect.poll(() => openedUrl(electronApp)).toBe('https://acme.atlassian.net/browse/PROJ-7')
})
