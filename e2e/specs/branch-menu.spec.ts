import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'

test.describe('branch right-click menu', () => {
  test.beforeEach(async ({ repo }) => {
    repo.addFeatureBranch()
  })

  test('merges a branch into main from its label on the commit graph', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.graph.badge('feature').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Merge feature into main' }).click()

    await expect(sillygit.graph.rows.first()).toContainText("Merge branch 'feature'")
    expect(repo.readFile('feature.txt')).toBe('feature\n')
  })

  test('right-clicking a commit row offers its branch', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.graph.row('Add feature.txt on feature').click({ button: 'right' })
    const menu = sillygit.page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Merge feature into main' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Rebase main onto feature' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Checkout feature' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Delete feature' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Cherry-pick commit' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Create tag here…' })).toBeVisible()
  })

  test('a local branch with a slash in its name is treated as local', async ({ sillygit, repo }) => {
    repo.git('branch', 'claude/thing', 'feature')
    await sillygit.openRepository(repo.path)

    await sillygit.graph.badge('claude/thing').click({ button: 'right' })
    await expect(sillygit.page.getByRole('menuitem', { name: 'Delete claude/thing', exact: true })).toBeVisible()
  })

  test('deletes an unmerged branch after confirming', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    sillygit.page.on('dialog', (dialog) => dialog.accept())

    await sillygit.sidebar.branchMenu('feature', 'Delete feature')

    await expect(sillygit.sidebar.branch('feature')).toHaveCount(0)
    expect(repo.git('branch', '--list', 'feature').trim()).toBe('')
  })

  test('renames a branch', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.sidebar.branchMenu('feature', 'Rename feature…')
    const dialog = sillygit.page.getByRole('dialog', { name: 'Rename feature' })
    await dialog.getByLabel('New branch name').fill('renamed')
    await dialog.getByRole('button', { name: 'Rename' }).click()

    await expect(sillygit.sidebar.branch('renamed')).toBeVisible()
    await expect(sillygit.sidebar.branch('feature')).toHaveCount(0)
  })

  test('creates a branch at a commit', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.graph.row('Initial commit').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Create branch here…' }).click()
    await sillygit.page.getByLabel('Branch name').fill('from-initial')
    await sillygit.page.keyboard.press('Enter')

    await expect(sillygit.graph.badge('from-initial')).toBeVisible()
    expect(repo.git('rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('from-initial')
  })

  test('the current branch has no merge or delete', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.sidebar.branch('main').click({ button: 'right' })
    const menu = sillygit.page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Copy branch name' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /^Merge/ })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: /^Delete/ })).toHaveCount(0)
  })

  test.describe('remote branches', () => {
    test.beforeEach(async ({ repo }) => {
      repo.addFakeRemote('git@github.com:owner/repo.git', ['main', 'feature'])
      repo.git('branch', '-D', 'feature')
    })

    test('merges a remote branch into main from the sidebar', async ({ sillygit, repo }) => {
      await sillygit.openRepository(repo.path)
      await sillygit.sidebar.expandRemotes()

      await sillygit.sidebar.branchMenu('feature', 'Merge origin/feature into main')

      await expect(sillygit.graph.rows.first()).toContainText("Merge remote-tracking branch 'origin/feature'")
    })

    test('checking out a remote branch creates a local tracking branch', async ({ sillygit, repo }) => {
      await sillygit.openRepository(repo.path)
      await sillygit.sidebar.expandRemotes()

      await sillygit.sidebar.branchMenu('feature', 'Checkout origin/feature')

      await expect(sillygit.branchCrumb).toContainText('feature')
      expect(repo.git('rev-parse', '--abbrev-ref', 'feature@{upstream}').trim()).toBe('origin/feature')
    })

    test('offers the pull request and GitHub links', async ({ sillygit, electronApp, repo }) => {
      await stubIpc(electronApp, 'git:branch-remote-info', {
        ok: true,
        data: {
          remote: 'origin',
          webUrl: 'https://github.com/owner/repo',
          remoteBranch: 'feature',
          pullRequest: { number: 16, url: 'https://github.com/owner/repo/pull/16' }
        }
      })
      await sillygit.openRepository(repo.path)

      await sillygit.graph.badge('origin/feature').click({ button: 'right' })
      const menu = sillygit.page.getByRole('menu')
      await expect(menu.getByRole('menuitem', { name: 'View pull request #16 on GitHub' })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: 'Copy link to branch: origin/feature' })).toBeVisible()

      await menu.getByRole('menuitem', { name: 'Copy link for pull request #16' }).click()
      const copied = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
      expect(copied).toBe('https://github.com/owner/repo/pull/16')
    })
  })
})
