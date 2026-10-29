import { expect, test } from '../fixtures'
import { savedLayout } from '../support/settings'

const width = async (cell: import('@playwright/test').Locator): Promise<number | undefined> =>
  (await cell.boundingBox())?.width

test.describe('Commit graph columns', () => {
  test('the author and date have their own columns', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await expect(sillygit.graph.cell('Add hello.txt', 'author')).toHaveText('E2E Tester')
    await expect(sillygit.graph.cell('Add hello.txt', 'date')).toHaveText(/ago|just now/)
  })

  test('the author column widens when its left edge is dragged left, and keeps its width after a relaunch', async ({
    sillygit,
    repo,
    relaunch,
    userData
  }) => {
    await sillygit.openRepository(repo.path)
    const author = sillygit.graph.cell('Add hello.txt', 'author')
    const before = (await width(author))!

    await sillygit.graph.dragColumnResizer('author', -60)

    await expect.poll(() => width(author)).toBeCloseTo(before + 60, 0)
    await expect.poll(() => savedLayout(userData)?.graphColumns?.author).toBeCloseTo(before + 60, 0)

    const reopened = await relaunch()
    await expect.poll(() => width(reopened.graph.cell('Add hello.txt', 'author'))).toBeCloseTo(before + 60, 0)
  })

  test('the graph column can be widened and double-click fits it to the lanes again', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    const graph = sillygit.graph.cell('Add hello.txt', 'graph')
    const fitted = (await width(graph))!

    await sillygit.graph.dragColumnResizer('graph', 50)
    await expect.poll(() => width(graph)).toBeCloseTo(fitted + 50, 0)

    await sillygit.graph.columnResizer('graph').dblclick()
    await expect.poll(() => width(graph)).toBeCloseTo(fitted, 0)
  })

  test('arrow keys resize a focused handle', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    const date = sillygit.graph.cell('Add hello.txt', 'date')
    const before = (await width(date))!

    await sillygit.graph.columnResizer('date').focus()
    // The date column is right of the message, so left widens it.
    await sillygit.page.keyboard.press('ArrowLeft')
    await sillygit.page.keyboard.press('ArrowLeft')

    await expect.poll(() => width(date)).toBeCloseTo(before + 20, 0)
  })
})
