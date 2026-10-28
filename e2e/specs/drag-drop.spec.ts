import { expect, test } from '../fixtures'
import { dragOnto } from '../support/drag'

test.describe('drag and drop on the graph', () => {
  test('dragging a branch onto main merges it after picking from the menu', async ({ sillygit, repo }) => {
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)

    await sillygit.graph.dragBranch('feature', 'main')
    const menu = sillygit.graph.dropMenu
    await expect(menu.getByRole('menuitem')).toHaveText(['Merge feature into main', 'Rebase feature onto main'])
    // Nothing happens until a choice is made.
    expect(repo.git('log', '-1', '--format=%s', 'main').trim()).toBe('Add main.txt')

    await menu.getByRole('menuitem', { name: 'Merge feature into main' }).click()
    await expect(sillygit.graph.rows.first()).toContainText("Merge branch 'feature'")
    expect(repo.readFile('feature.txt')).toBe('feature\n')
  })

  test('dragging main onto a branch that is not checked out rebases it', async ({ sillygit, repo }) => {
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)

    await sillygit.graph.dragBranch('feature', 'main')
    await sillygit.graph.dropMenu.getByRole('menuitem', { name: 'Rebase feature onto main' }).click()

    await expect(sillygit.branchCrumb).toContainText('feature')
    expect(repo.git('log', '--format=%s', '-2', 'feature').trim().split('\n')).toEqual([
      'Add feature.txt on feature',
      'Add main.txt'
    ])
  })

  test('offers a fast-forward when the branch is behind, without checking it out', async ({ sillygit, repo }) => {
    repo.git('checkout', '-q', '-b', 'ahead')
    repo.commitFile('ahead.txt', 'ahead\n', 'Add ahead.txt')
    repo.git('checkout', '-q', '-b', 'other', 'main~1')
    await sillygit.openRepository(repo.path)

    await sillygit.graph.dragBranch('ahead', 'main')
    await sillygit.graph.dropMenu.getByRole('menuitem', { name: 'Fast-forward main to ahead' }).click()

    await expect.poll(() => repo.git('rev-parse', 'main').trim()).toBe(repo.git('rev-parse', 'ahead').trim())
    expect(repo.git('symbolic-ref', '--short', 'HEAD').trim()).toBe('other')
  })

  test('dragging a commit onto a branch cherry-picks it', async ({ sillygit, repo }) => {
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)

    await sillygit.graph.dragCommit('Add feature.txt on feature', 'main')
    const short = repo.git('rev-parse', '--short=7', 'feature').trim()
    await sillygit.graph.dropMenu.getByRole('menuitem', { name: `Cherry-pick ${short} onto main` }).click()

    await expect.poll(() => repo.git('log', '-1', '--format=%s', 'main').trim()).toBe('Add feature.txt on feature')
    await expect(sillygit.graph.row('Add feature.txt on feature')).toHaveCount(2)
  })

  test('a drop that conflicts opens the conflict view', async ({ sillygit, repo }) => {
    repo.addConflictingBranch()
    await sillygit.openRepository(repo.path)

    await sillygit.graph.dragBranch('feature', 'main')
    await sillygit.graph.dropMenu.getByRole('menuitem', { name: 'Merge feature into main' }).click()

    await sillygit.conflicts.expectConflicts('Merge conflicts detected', 'Merging feature into main', ['notes.txt'])
  })

  test('branches drag from the sidebar too', async ({ sillygit, repo }) => {
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)

    await dragOnto(sillygit.sidebar.branch('feature'), sillygit.sidebar.branch('main'))
    await expect(sillygit.graph.dropMenu.getByRole('menuitem', { name: 'Merge feature into main' })).toBeVisible()
  })

  test('clicks and double-clicks on labels still work, and Escape cancels a drag', async ({ sillygit, repo }) => {
    const page = sillygit.page
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)

    await sillygit.graph.badge('feature').click()
    await sillygit.graph.expectSelected('Add feature.txt on feature')

    const box = (await sillygit.graph.badge('feature').boundingBox())!
    await page.mouse.move(box.x + 10, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 60, box.y + 60, { steps: 5 })
    await expect(page.getByTestId('drag-ghost')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('drag-ghost')).toHaveCount(0)
    await page.mouse.up()
    await expect(sillygit.graph.dropMenu).toHaveCount(0)

    await sillygit.graph.badge('feature').dblclick()
    await expect(sillygit.branchCrumb).toContainText('feature')
  })
})
