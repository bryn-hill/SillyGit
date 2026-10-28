import { expect, test } from '../fixtures'
import { chooseOption } from '../pages/Select'

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY).toISOString()

test.describe('branch status tags', () => {
  test.beforeEach(({ repo }) => {
    repo.addFeatureBranch()
    // origin/main is one commit behind main, origin/feature one commit ahead of feature.
    repo.addFakeRemote('git@github.com:owner/repo.git', ['main', 'feature'])
    repo.git('update-ref', 'refs/remotes/origin/main', 'main~1')
    repo.git('branch', '-u', 'origin/main', 'main')
    repo.git('branch', '-u', 'origin/feature', 'feature')
    repo.git('reset', '-q', '--hard', 'HEAD')
    repo.git('branch', '-f', 'feature', 'feature~1')
    // "gone" tracks origin/gone, which a fetch --prune has since removed.
    repo.git('branch', 'gone')
    repo.git('config', 'branch.gone.remote', 'origin')
    repo.git('config', 'branch.gone.merge', 'refs/heads/gone')
  })

  test('shows ahead/behind and branches deleted on the remote', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    const { sidebar } = sillygit

    await expect(sidebar.syncCounts('main')).toHaveText('↑1')
    await expect(sidebar.syncCounts('main')).toHaveAttribute('title', /1 commit to push \(origin\/main/)
    await expect(sidebar.syncCounts('feature')).toHaveText('↓1')
    await expect(sidebar.syncCounts('feature')).toHaveAttribute('title', /1 commit to pull/)

    await expect(sidebar.deletedTag('gone')).toHaveText('deleted')
    await expect(sidebar.deletedTag('main')).toHaveCount(0)
    await expect(sidebar.syncCounts('gone')).toHaveCount(0)
  })

  test('tags stale branches with their age, from the threshold in Settings', async ({ sillygit, repo }) => {
    repo.git('checkout', '-q', '-b', 'old')
    repo.commitFileAt('old.txt', 'old\n', 'Old work', daysAgo(20))
    repo.git('checkout', '-q', '-b', 'ancient')
    repo.commitFileAt('ancient.txt', 'ancient\n', 'Ancient work', daysAgo(400))
    repo.git('checkout', '-q', 'main')
    await sillygit.openRepository(repo.path)
    const { sidebar, settings } = sillygit

    // Stale after 30 days by default.
    await expect(sidebar.staleTag('ancient')).toHaveText('stale 1y')
    await expect(sidebar.staleTag('old')).toHaveCount(0)
    await expect(sidebar.staleTag('main')).toHaveCount(0)

    await settings.open()
    await expect(settings.staleEnabled).toBeChecked()
    await chooseOption(settings.staleDays, '2 weeks')
    await settings.close()
    await expect(sidebar.staleTag('old')).toHaveText('stale 2w')

    await settings.open()
    await settings.staleEnabled.uncheck()
    await settings.close()
    await expect(sidebar.staleTag('old')).toHaveCount(0)
    await expect(sidebar.staleTag('ancient')).toHaveCount(0)
  })
})

test('starred branches are pinned to the top and remembered per repo', async ({ sillygit, repo }) => {
  const { page } = sillygit
  repo.git('branch', 'feature/login')
  repo.git('branch', 'zeta')
  await sillygit.openRepository(repo.path)
  const { sidebar } = sillygit

  await expect(sidebar.favourites).toHaveCount(0)
  await sidebar.toggleStar('zeta')
  await sillygit.sidebar.branchNamed('feature/login').click({ button: 'right' })
  await page.getByRole('menu').getByRole('menuitem', { name: 'Add feature/login to favourites' }).click()

  // Starred order, full names, and no longer repeated under LOCAL.
  await expect(sidebar.favourites.locator('.branch-name')).toHaveText(['zeta', 'feature/login'])
  await expect(sidebar.branchNamed('zeta')).toHaveCount(1)
  const rows = sidebar.root.locator('.branch-row')
  await expect(rows.first()).toHaveAttribute('data-branch', 'zeta')

  const saved = await page.evaluate(
    (path) => (window as unknown as { api: { getFavouriteBranches(p: string): Promise<string[]> } }).api.getFavouriteBranches(path),
    repo.path
  )
  expect(saved).toEqual(['zeta', 'feature/login'])

  await sidebar.toggleStar('zeta')
  await expect(sidebar.favourites.locator('.branch-name')).toHaveText(['feature/login'])
  await expect(sidebar.branch('zeta')).toBeVisible()
})
