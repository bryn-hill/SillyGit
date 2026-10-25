import { expect, test } from '../fixtures'

test.beforeEach(async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.details.openFile('hello.txt')
})

test('clicking a changed file opens its diff', async ({ sillygit }) => {
  await sillygit.commitView.expectShowing('hello.txt', 'world')
})

test('the back button returns to the commit graph', async ({ sillygit }) => {
  await sillygit.commitView.back()

  await sillygit.commitView.expectClosed()
  await expect(sillygit.graph.root).toBeVisible()
})

test('clicking the open file again closes the diff', async ({ sillygit }) => {
  await sillygit.commitView.file('hello.txt').click()

  await sillygit.commitView.expectClosed()
  await expect(sillygit.graph.root).toBeVisible()
})
