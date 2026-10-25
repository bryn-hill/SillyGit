import { test } from '../fixtures'

test.beforeEach(async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
})

test('the newest commit is selected when a clean repository opens', async ({ sillygit }) => {
  await sillygit.graph.expectSelected('Add hello.txt')
  await sillygit.details.expectCommit('Add hello.txt')
})

test('clicking a commit shows it in the side bar', async ({ sillygit }) => {
  await sillygit.graph.select('Initial commit')

  await sillygit.graph.expectSelected('Initial commit')
  await sillygit.details.expectCommit('Initial commit')
})

test('clicking the selected commit again closes the side bar', async ({ sillygit }) => {
  await sillygit.graph.select('Add hello.txt')

  await sillygit.graph.expectNothingSelected()
  await sillygit.details.expectClosed()

  await sillygit.graph.select('Add hello.txt')
  await sillygit.details.expectCommit('Add hello.txt')
})

test('arrow keys move the selection', async ({ sillygit }) => {
  await sillygit.page.keyboard.press('ArrowDown')
  await sillygit.details.expectCommit('Initial commit')

  await sillygit.page.keyboard.press('ArrowUp')
  await sillygit.details.expectCommit('Add hello.txt')
})
