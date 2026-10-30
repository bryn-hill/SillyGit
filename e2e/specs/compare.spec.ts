import { expect, test } from '../fixtures'
import { Compare } from '../pages/Compare'

test.describe('compare two commits or branches', () => {
  test.beforeEach(async ({ repo }) => {
    repo.addFeatureBranch()
  })

  test('compares the current branch with another from its menu', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    const compare = new Compare(sillygit.page)

    await sillygit.graph.badge('feature').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Compare main with feature' }).click()

    await expect(compare.title).toHaveText('Compare main→feature')
    await expect(compare.files).toHaveCount(2)
    await expect(compare.file('feature.txt')).toContainText('A')
    await expect(compare.file('main.txt')).toContainText('D')
    await expect(compare.commitsOnlyIn('feature')).toHaveText([/Add feature.txt on feature/])
    await expect(compare.commitsOnlyIn('main')).toHaveText([/Add main.txt/])
    await expect(compare.diff).toContainText('feature')

    await compare.swap()
    await expect(compare.title).toHaveText('Compare feature→main')
    await expect(compare.file('main.txt')).toContainText('A')

    // A listed commit closes the comparison and is selected in the graph.
    await compare.commitsOnlyIn('main').first().click()
    await expect(compare.root).toHaveCount(0)
    await sillygit.graph.expectSelected('Add main.txt')
  })

  test('compares two selected commits from the detail panel', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    const compare = new Compare(sillygit.page)

    await sillygit.graph.select('Add hello.txt')
    await sillygit.graph.row('Initial commit').click({ modifiers: ['ControlOrMeta'] })
    await sillygit.details.root.getByRole('button', { name: 'Compare' }).click()

    await expect(compare.files).toHaveText([/hello.txt/])
    await expect(compare.commitsOnlyIn(repo.git('rev-parse', '--short=7', 'HEAD~1').trim())).toHaveText([/Add hello.txt/])
    await expect(compare.diff).toContainText('world')

    await sillygit.page.keyboard.press('Escape')
    await expect(compare.root).toHaveCount(0)
  })
})
