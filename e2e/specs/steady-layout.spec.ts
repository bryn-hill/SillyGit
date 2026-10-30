import { expect, test } from '../fixtures'

// Opening a file full window keeps the detail panel where it was beside the graph, and going back
// finds the graph as it was left.

test('a working file opening full window leaves the changes list where it was', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nworld\nchanged\n')
  repo.writeFile('notes.txt', 'some notes\n')
  await sillygit.openRepository(repo.path)
  const row = sillygit.details.listedFile('Unstaged', 'notes.txt')
  const panelBefore = await sillygit.details.root.boundingBox()
  const rowBefore = await row.boundingBox()

  await sillygit.details.listedFile('Unstaged', 'hello.txt').click()
  await sillygit.workingFile.expectShowing('hello.txt', 'changed')

  expect(await sillygit.details.root.boundingBox()).toEqual(panelBefore)
  expect(await row.boundingBox()).toEqual(rowBefore)
})

test("a commit's file opening full window leaves the commit's details where they were", async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nthere\n')
  repo.writeFile('notes.txt', 'some notes\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'Edit two files')
  await sillygit.openRepository(repo.path)
  await sillygit.details.expectCommit('Edit two files')
  const row = sillygit.details.file('notes.txt')
  const panelBefore = await sillygit.details.root.boundingBox()
  const rowBefore = await row.boundingBox()

  await sillygit.details.openFile('hello.txt')
  await sillygit.commitView.expectShowing('hello.txt', 'there')

  expect(await sillygit.details.root.boundingBox()).toEqual(panelBefore)
  expect(await row.boundingBox()).toEqual(rowBefore)
  await sillygit.details.openFile('notes.txt')
  await sillygit.commitView.expectShowing('notes.txt', 'some notes')
  expect(await row.boundingBox()).toEqual(rowBefore)
})

test('the graph comes back scrolled where it was left', async ({ sillygit, repo }) => {
  for (let i = 0; i < 60; i++) repo.commitFile(`f${i}.txt`, `${i}\n`, `Commit ${i}`)
  await sillygit.openRepository(repo.path)
  await sillygit.graph.root.evaluate((el) => {
    el.scrollTop = 700
  })
  await sillygit.graph.select('Commit 30')
  const scrolled = await sillygit.graph.root.evaluate((el) => el.scrollTop)

  await sillygit.details.openFile('f30.txt')
  await sillygit.commitView.expectShowing('f30.txt', '30')
  await sillygit.commitView.back()

  await expect(sillygit.graph.root).toBeVisible()
  expect(await sillygit.graph.root.evaluate((el) => el.scrollTop)).toBe(scrolled)
})
