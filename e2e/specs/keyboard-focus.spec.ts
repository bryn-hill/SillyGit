import { expect, test } from '../fixtures'

test.beforeEach(async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
})

test('Tab skips the collapsed terminal panel', async ({ sillygit }) => {
  for (let i = 0; i < 20; i++) {
    await sillygit.page.keyboard.press('Tab')
    await expect(sillygit.terminal.newTabButton).not.toBeFocused()
  }
})

test('Tab reaches the commit graph, where arrow keys move the selection', async ({ sillygit }) => {
  await sillygit.tabTo(sillygit.graph.root)

  await sillygit.page.keyboard.press('ArrowDown')
  await sillygit.details.expectCommit('Initial commit')
})

test('Escape leaves a focused field so arrow keys drive the graph again', async ({ sillygit }) => {
  await sillygit.tabTo(sillygit.branchFilter)
  await sillygit.page.keyboard.press('ArrowDown')
  await sillygit.details.expectCommit('Add hello.txt')

  await sillygit.page.keyboard.press('Escape')
  await expect(sillygit.branchFilter).not.toBeFocused()
  await sillygit.page.keyboard.press('ArrowDown')
  await sillygit.details.expectCommit('Initial commit')
})
