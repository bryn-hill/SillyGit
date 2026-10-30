import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ElectronApplication } from '@playwright/test'
import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import type { HostedRepo, HostedRepoList, PublishResult } from '../../src/shared/hostedRepos'

// Accounts and their hosts' APIs are stubbed at the IPC layer (no keychain or
// network in CI); src/main/hostedRepos.test.ts covers the API calls and the push.

const GITHUB = {
  id: 'acct-gh',
  provider: 'github',
  host: 'github.com',
  username: 'ada',
  displayName: 'Ada Lovelace',
  avatar: null,
  emails: [],
  addedAt: '2026-10-30T00:00:00.000Z'
}
const GITLAB = { ...GITHUB, id: 'acct-gl', provider: 'gitlab', host: 'gitlab.com' }

const hosted = (fullName: string, cloneUrl: string, extra: Partial<HostedRepo> = {}): HostedRepo => ({
  accountId: GITHUB.id,
  provider: 'github',
  host: 'github.com',
  fullName,
  description: '',
  private: false,
  cloneUrl,
  sshUrl: `git@github.com:${fullName}.git`,
  webUrl: `https://github.com/${fullName}`,
  updatedAt: null,
  ...extra
})

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

test.describe('clone from accounts', () => {
  let parent: string

  test.beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'sillygit-clone-into-'))
  })

  test.afterEach(() => {
    rmSync(parent, { recursive: true, force: true })
  })

  test('searches the accounts\' repositories and clones the one picked', async ({ sillygit, electronApp, repo }) => {
    // The listed "GitHub" repo really clones from the fixture repo on disk.
    const list: HostedRepoList = {
      repos: [
        hosted('ada/website', repo.path, { description: 'The shop front', private: true }),
        hosted('ada/api', '/nowhere/api'),
        hosted('team/tools', '/nowhere/tools', { accountId: GITLAB.id, provider: 'gitlab', host: 'gitlab.com' })
      ],
      errors: [{ accountId: GITLAB.id, message: '401 Unauthorized' }]
    }
    await stubIpc(electronApp, 'accounts:list', { ok: true, data: [GITHUB, GITLAB] })
    await stubIpc(electronApp, 'accounts:repos', { ok: true, data: list })
    await electronApp.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [path] })) as never
    }, parent)

    await sillygit.page.getByRole('button', { name: 'Clone Repository', exact: true }).click()
    const dialog = sillygit.page.getByRole('dialog', { name: 'Clone a repository' })
    const repos = dialog.getByRole('listbox', { name: 'Your repositories' }).getByRole('option')
    await expect(repos).toHaveCount(3)
    await expect(dialog.getByRole('alert')).toContainText("Couldn't list GitLab · ada: 401 Unauthorized")

    await dialog.getByRole('searchbox', { name: 'Search your repositories' }).fill('shop')
    await expect(repos).toHaveCount(1)
    await expect(repos.first()).toContainText('ada/website')
    await expect(repos.first()).toContainText('Private')
    await repos.first().click()
    const url = dialog.getByRole('textbox', { name: 'Repository URL' })
    await expect(url).toHaveValue(repo.path)

    // SSH swaps in the SSH URL; unticking it puts the HTTPS one back.
    const ssh = dialog.getByRole('checkbox', { name: /Clone over SSH/ })
    await ssh.check()
    await expect(url).toHaveValue('git@github.com:ada/website.git')
    await ssh.uncheck()
    await expect(url).toHaveValue(repo.path)

    await dialog.getByRole('button', { name: 'Choose folder…' }).click()
    await expect(dialog).toHaveCount(0)
    const cloned = join(parent, repo.path.split('/').pop()!)
    await expect(sillygit.repositoryCrumb).toContainText(repo.path.split('/').pop()!)
    expect(existsSync(join(cloned, '.git'))).toBe(true)
    expect(execFileSync('git', ['-C', cloned, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()).toBe(
      repo.git('log', '-1', '--format=%s').trim()
    )
  })

  test('without an account it takes a URL and points to Settings', async ({ sillygit, electronApp }) => {
    await stubIpc(electronApp, 'accounts:list', { ok: true, data: [] })
    await sillygit.page.getByRole('button', { name: 'Clone Repository', exact: true }).click()
    const dialog = sillygit.page.getByRole('dialog', { name: 'Clone a repository' })
    await expect(dialog).toContainText('Add a GitHub, GitLab, Bitbucket or Azure DevOps account')
    await expect(dialog.getByRole('listbox')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Choose folder…' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Add an account…' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(sillygit.page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  })
})

test('a repository with no remote is published to a signed-in account', async ({ sillygit, electronApp, repo }) => {
  const result: PublishResult = {
    remote: 'origin',
    branch: 'main',
    cloneUrl: 'https://github.com/acme/fixture.git',
    webUrl: 'https://github.com/acme/fixture'
  }
  await stubIpc(electronApp, 'accounts:list', { ok: true, data: [GITHUB] })
  await stubIpc(electronApp, 'accounts:publish-owners', {
    ok: true,
    data: [
      { id: '', label: 'ada (you)' },
      { id: 'org:acme', label: 'acme' }
    ]
  })
  await recordIpc(electronApp, 'repo:publish', { ok: true, data: result })
  await sillygit.openRepository(repo.path)

  await expect(sillygit.toolbarButton('Push')).toHaveCount(0)
  await sillygit.toolbarButton('Publish repository').click()
  const dialog = sillygit.page.getByRole('dialog', { name: 'Publish repository' })
  await expect(dialog).toContainText('pushes main to it')
  const name = dialog.getByRole('textbox', { name: 'Name' })
  await expect(name).toHaveValue(repo.path.split('/').pop()!)

  await name.fill('bad name')
  await expect(dialog).toContainText('Use only letters, numbers, dots, dashes and underscores.')
  await expect(dialog.getByRole('button', { name: 'Publish repository' })).toBeDisabled()
  await name.fill('fixture')
  await dialog.getByRole('combobox', { name: 'Owner' }).click()
  await sillygit.page.getByRole('option', { name: 'acme' }).click()
  await dialog.getByRole('textbox', { name: 'Description' }).fill('Test fixture')
  await dialog.getByRole('checkbox', { name: /Private/ }).uncheck()
  await dialog.getByRole('button', { name: 'Publish repository' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(sillygit.notice).toContainText('Published main to https://github.com/acme/fixture.')
  expect(await recorded(electronApp, 'repo:publish')).toEqual([
    [repo.path, { accountId: GITHUB.id, owner: 'org:acme', name: 'fixture', description: 'Test fixture', private: false }]
  ])
})
