import { expect, test } from '../fixtures'

// feature, other and main (checked out) each have one commit of their own.
test.describe('hide, solo or limit graph branches', () => {
  test.beforeEach(({ repo }) => {
    repo.addFeatureBranch()
    repo.git('checkout', '-q', '-b', 'other', 'main~1')
    repo.commitFile('other.txt', 'other\n', 'Add other.txt')
    repo.git('checkout', '-q', 'main')
  })

  test('hides a branch from its menu and shows it again from the chip', async ({ sillygit, repo }) => {
    const { graph, sidebar, page } = sillygit
    await sillygit.openRepository(repo.path)
    await expect(graph.row('Add feature.txt on feature')).toBeVisible()

    await graph.badge('feature').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Hide feature in graph' }).click()
    await expect(graph.row('Add feature.txt on feature')).toHaveCount(0)
    await expect(graph.row('Add other.txt')).toBeVisible()
    await expect(graph.scopeChips).toHaveText(['feature hidden×'])
    await expect(sidebar.graphTag('feature', 'hidden')).toBeVisible()

    // The checked-out branch can't be hidden.
    await sidebar.branchNamed('main').click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Hide main in graph' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Show feature' }).click()
    await expect(graph.row('Add feature.txt on feature')).toBeVisible()
    await expect(graph.scopeChips).toHaveCount(0)
    await expect(sidebar.graphTag('feature', 'hidden')).toHaveCount(0)
  })

  test('solos a branch, limits to the current branch, and remembers it', async ({ sillygit, repo, relaunch }) => {
    await sillygit.openRepository(repo.path)
    const { graph, sidebar, page } = sillygit

    await sidebar.branchNamed('feature').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Show only feature in graph' }).click()
    await expect(graph.row('Add feature.txt on feature')).toBeVisible()
    await expect(graph.row('Add main.txt')).toHaveCount(0)
    await expect(graph.row('Add other.txt')).toHaveCount(0)
    await expect(graph.scopeChips).toHaveText(['Only feature×'])
    await expect(sidebar.graphTag('feature', 'solo')).toBeVisible()

    await graph.currentBranchToggle.click()
    await expect(graph.currentBranchToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(graph.row('Add main.txt')).toBeVisible()
    await expect(graph.row('Add feature.txt on feature')).toHaveCount(0)
    await expect(graph.row('Add other.txt')).toHaveCount(0)
    await expect(graph.scopeChips).toHaveText(['Current branch only×'])

    const relaunched = await relaunch()
    await expect(relaunched.graph.row('Add main.txt')).toBeVisible()
    await expect(relaunched.graph.row('Add other.txt')).toHaveCount(0)
    await expect(relaunched.graph.currentBranchToggle).toHaveAttribute('aria-pressed', 'true')
    await relaunched.graph.currentBranchToggle.click()
    await expect(relaunched.graph.row('Add other.txt')).toBeVisible()
    await expect(relaunched.graph.row('Add feature.txt on feature')).toBeVisible()
  })
})
