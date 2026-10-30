import type { ElectronApplication } from '@playwright/test'
import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import type { PullRequestDetail } from '../../src/shared/prReview'
import type { LaunchpadData } from '../../src/shared/types'

// Azure DevOps is stubbed at the IPC layer (no keychain or network in CI);
// src/main/azure.test.ts covers the API calls behind these channels.

const ACCOUNT = {
  id: 'acct-azure',
  provider: 'azure',
  host: 'dev.azure.com',
  username: 'ada@contoso.com',
  organization: 'contoso',
  displayName: 'Ada Lovelace',
  avatar: null,
  emails: ['ada@contoso.com'],
  addedAt: '2026-10-30T00:00:00.000Z'
}

const REPO = '/work/site'
const URL = 'https://dev.azure.com/contoso/Web/_git/site/pullrequest/41'

const launchpad: LaunchpadData = {
  connected: true,
  login: 'ada@contoso.com',
  pullRequests: [
    {
      number: 41,
      title: 'Cache the product list',
      url: URL,
      author: 'Grace Hopper',
      isMine: false,
      isDraft: false,
      headRefName: 'feature/cache',
      baseRefName: 'main',
      updatedAt: '2026-10-30T08:00:00Z',
      additions: 0,
      deletions: 0,
      bucket: 'needsMyReview',
      repoPath: REPO,
      repoName: 'site',
      provider: 'azure'
    }
  ]
}

const detail: PullRequestDetail = {
  repoPath: REPO,
  number: 41,
  title: 'Cache the product list',
  body: 'Saves a round trip on every page.',
  url: URL,
  author: 'Grace Hopper',
  state: 'OPEN',
  isDraft: false,
  headRefName: 'feature/cache',
  baseRefName: 'main',
  headSha: 'abc123',
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  additions: 3,
  deletions: 1,
  createdAt: '2026-10-30T08:00:00Z',
  viewer: 'Ada Lovelace',
  checks: [{ name: 'Build: CI', state: 'success', description: 'Required' }],
  reviews: [{ id: 'bob', author: 'Bob', state: 'APPROVED', body: 'Approved', submittedAt: '2026-10-30T09:00:00Z' }],
  comments: [],
  threads: [],
  files: [
    {
      path: 'src/products.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
      patch: '@@ -1,2 +1,4 @@\n-export const load = () => fetchAll()\n+const cache = new Map()\n+export const load = () =>\n+  cache.get("all") ?? fetchAll()\n export {}'
    }
  ],
  provider: 'azure'
}

/** Replaces a channel with one that records its arguments and answers `result`. */
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
  return app.evaluate((_electron, channel) => (globalThis as unknown as { ipcCalls: Record<string, unknown[][]> }).ipcCalls[channel], channel)
}

test('an Azure DevOps token is added for an organization', async ({ sillygit, electronApp }) => {
  await stubIpc(electronApp, 'accounts:storage-problem', null)
  await stubIpc(electronApp, 'accounts:list', { ok: true, data: [] })
  await recordIpc(electronApp, 'accounts:add', { ok: true, data: ACCOUNT })

  const settings = sillygit.settings
  await settings.open()
  await settings.addAccountButton.click()
  await settings.service('Azure DevOps').click()
  // Every organization lives on dev.azure.com, so there's no server to type.
  await expect(settings.hostInput).toHaveCount(0)
  await expect(settings.addAccountForm.getByRole('button', { name: 'Add account' })).toBeDisabled()
  await settings.organizationInput.fill('https://dev.azure.com/contoso/Web')
  await settings.addToken('azure-pat')

  expect(await recorded(electronApp, 'accounts:add')).toEqual([
    [{ provider: 'azure', host: 'dev.azure.com', username: '', organization: 'contoso', token: 'azure-pat' }]
  ])
  await expect(settings.account('Ada Lovelace')).toContainText('Azure DevOps · ada@contoso.com · contoso')
})

test('Azure DevOps pull requests show in Launchpad and open for review', async ({ sillygit, electronApp }) => {
  await stubIpc(electronApp, 'launchpad:get-data', { ok: true, data: launchpad })
  await stubIpc(electronApp, 'pr:get-detail', { ok: true, data: detail })

  await sillygit.tabs.launchpad.click()
  const card = sillygit.launchpad.card('Cache the product list')
  await expect(card).toContainText('site · #41 · feature/cache → main · Grace Hopper')
  // Azure DevOps doesn't report a pull request's size in the list, so no +0 -0.
  await expect(card.locator('.launchpad-stat-add')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('title', 'Open on Azure DevOps')

  await card.getByRole('button', { name: 'Review', exact: true }).click()
  const pr = sillygit.pullRequest
  await expect(pr.root).toContainText('Grace Hopper wants to merge feature/cache into main')
  await expect(pr.root.getByRole('button', { name: 'Open on Azure DevOps' })).toBeVisible()
  await expect(pr.checks).toContainText('Build: CI')
  await expect(pr.root).toContainText('Bob')
  await pr.filesTab.click()
  await expect(pr.diff).toContainText('cache.get("all")')
})
