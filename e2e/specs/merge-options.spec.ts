import type { ElectronApplication } from '@playwright/test'
import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import type { LaunchpadData } from '../../src/shared/types'

test.describe('local merge options', () => {
  test('squash merge from the branch menu stages the branch and prefills the message', async ({ sillygit, repo }) => {
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)
    const before = repo.git('rev-parse', 'main').trim()

    await sillygit.graph.badge('feature').click({ button: 'right' })
    const menu = sillygit.page.getByRole('menu')
    await menu.getByText('Merge feature into main with…').hover()
    await menu.getByRole('menuitem', { name: 'Squash into one commit' }).click()

    await expect(sillygit.details.commitMessage).toHaveValue("Squash merge branch 'feature'")
    await expect(sillygit.notice).toContainText('Squashed feature')
    expect(repo.git('rev-parse', 'main').trim()).toBe(before)
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('feature.txt')
  })

  test('no-ff from the drop menu makes a merge commit where a fast-forward would do', async ({ sillygit, repo }) => {
    repo.git('checkout', '-q', '-b', 'ahead')
    repo.commitFile('ahead.txt', 'ahead\n', 'Add ahead.txt')
    repo.git('checkout', '-q', 'main')
    await sillygit.openRepository(repo.path)

    await sillygit.graph.dragBranch('ahead', 'main')
    const menu = sillygit.graph.dropMenu
    await menu.getByText('Merge ahead into main with…').hover()
    await menu.getByRole('menuitem', { name: 'Always create a merge commit' }).click()

    await expect(sillygit.graph.rows.first()).toContainText("Merge branch 'ahead'")
  })
})

test.describe('pull request merge method', () => {
  const launchpad = (repoPath: string): LaunchpadData => ({
    connected: true,
    login: 'bryn',
    pullRequests: [
      {
        number: 7,
        title: 'Add login page',
        url: 'https://github.com/bryn/app/pull/7',
        author: 'bryn',
        isMine: true,
        isDraft: false,
        headRefName: 'bryn/login',
        baseRefName: 'main',
        updatedAt: '2026-10-27T09:00:00Z',
        additions: 1,
        deletions: 0,
        bucket: 'readyToMerge',
        repoPath,
        repoName: 'app'
      }
    ]
  })

  async function recordMerges(app: ElectronApplication): Promise<() => Promise<unknown[][]>> {
    await app.evaluate(({ ipcMain }) => {
      const g = globalThis as unknown as { merges: unknown[][] }
      g.merges = []
      ipcMain.removeHandler('launchpad:merge-pr')
      ipcMain.handle('launchpad:merge-pr', (_e, ...args) => {
        g.merges.push(args)
        return { ok: true, data: undefined }
      })
    })
    return () => app.evaluate(() => (globalThis as unknown as { merges: unknown[][] }).merges)
  }

  test('offers only the methods the repository allows', async ({ sillygit, electronApp, repo }) => {
    await stubIpc(electronApp, 'launchpad:get-data', { ok: true, data: launchpad(repo.path) })
    await stubIpc(electronApp, 'launchpad:merge-methods', { ok: true, data: { allowed: ['squash', 'rebase'], known: true } })
    const merges = await recordMerges(electronApp)

    await sillygit.tabs.launchpad.click()
    await sillygit.launchpad.card('Add login page').getByRole('button', { name: 'Merge…' }).click()

    const dialog = sillygit.page.getByRole('dialog', { name: 'Merge pull request #7' })
    const methods = dialog.getByRole('radiogroup', { name: 'Merge method' })
    await expect(methods.getByRole('radio', { name: /Create a merge commit/ })).toBeDisabled()
    await expect(methods.getByRole('radio', { name: /Squash and merge/ })).toHaveAttribute('aria-checked', 'true')

    await methods.getByRole('radio', { name: /Rebase and merge/ }).click()
    await dialog.getByRole('button', { name: 'Rebase and merge', exact: true }).click()

    await expect(dialog).toBeHidden()
    expect(await merges()).toEqual([[repo.path, 7, 'rebase']])
  })
})
