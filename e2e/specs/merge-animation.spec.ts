import { expect, test } from '../fixtures'

test.describe('new commit and merge animation', () => {
  test.beforeEach(async ({ repo }) => {
    repo.addFeatureBranch()
  })

  test('plays over the new merge commit, then goes away', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await expect(sillygit.graph.mergeBurst).toHaveCount(0)

    await sillygit.graph.badge('feature').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Merge feature into main' }).click()

    const mergeRow = sillygit.graph.row("Merge branch 'feature'")
    await expect(mergeRow.getByTestId('merge-burst')).toHaveCount(1)
    await expect(sillygit.graph.mergeBurst).toHaveCount(0)
  })

  test('plays over a new commit on the checked-out branch, made in the app or elsewhere', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    repo.commitFile('outside.txt', 'made elsewhere\n', 'Commit from the command line')

    const row = sillygit.graph.row('Commit from the command line')
    await expect(row.getByTestId('merge-burst')).toHaveCount(1)
    await expect(sillygit.graph.mergeBurst).toHaveCount(0)
  })

  test('can be turned off in Settings', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await sillygit.settings.open()
    await expect(sillygit.settings.mergeAnimation).toBeChecked()
    await sillygit.settings.mergeAnimation.uncheck()
    await sillygit.settings.close()

    await sillygit.graph.badge('feature').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Merge feature into main' }).click()

    await expect(sillygit.graph.rows.first()).toContainText("Merge branch 'feature'")
    await expect(sillygit.graph.mergeBurst).toHaveCount(0)
  })
})
