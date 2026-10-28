import { expect, test } from '../fixtures'

test.describe('a changed file in the working directory', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    repo.writeFile('hello.txt', 'hello\nworld\nchanged\n')
    repo.writeFile('notes.txt', 'some notes\n')
    await sillygit.openRepository(repo.path)
    await sillygit.details.listedFile('Unstaged', 'hello.txt').click()
  })

  test('opens its diff full window with the changes still listed on the right', async ({ sillygit }) => {
    const view = sillygit.workingFile
    await view.expectShowing('hello.txt', 'changed')
    await expect(view.side).toHaveText('Unstaged changes')
    await expect(sillygit.graph.root).toBeHidden()
    await expect(sillygit.details.activeFile).toContainText('hello.txt')

    const list = await sillygit.details.root.boundingBox()
    const diff = await view.diff.boundingBox()
    expect(diff!.x + diff!.width).toBeLessThanOrEqual(list!.x + 1)
  })

  test('picking another file in the list shows that file instead', async ({ sillygit }) => {
    await sillygit.details.listedFile('Unstaged', 'notes.txt').click()

    await sillygit.workingFile.expectShowing('notes.txt', 'some notes')
    await expect(sillygit.workingFile.side).toHaveText('New file')
    await expect(sillygit.details.activeFile).toContainText('notes.txt')
  })

  test('clicking the open file again goes back to the graph', async ({ sillygit }) => {
    await sillygit.details.listedFile('Unstaged', 'hello.txt').click()

    await sillygit.workingFile.expectClosed()
    await expect(sillygit.graph.root).toBeVisible()
  })

  test('staging the file keeps its diff open on the staged side', async ({ sillygit }) => {
    await sillygit.workingFile.stageButton.click()

    await expect(sillygit.workingFile.side).toHaveText('Staged changes')
    await expect(sillygit.workingFile.diff).toContainText('changed')
    await expect(sillygit.details.listedFile('Staged', 'hello.txt')).toHaveAttribute('aria-current', 'true')

    await sillygit.workingFile.unstageButton.click()
    await expect(sillygit.workingFile.side).toHaveText('Unstaged changes')
  })

  test('discarding the only hunk closes the diff once the file is unchanged', async ({ sillygit, repo }) => {
    await sillygit.workingFile.diff.getByRole('button', { name: /Discard Hunk/ }).click()

    await expect.poll(() => repo.readFile('hello.txt')).toBe('hello\nworld\n')
    await sillygit.workingFile.expectClosed()
  })

  test('history keeps the list beside it, follows the picked file and goes back to the diff', async ({ sillygit }) => {
    await sillygit.workingFile.diff.getByRole('button', { name: 'History', exact: true }).click()

    const history = sillygit.fileHistory
    await history.expectHistory(['Add hello.txt'])
    await expect(sillygit.details.root).toBeVisible()
    await expect(sillygit.details.activeFile).toContainText('hello.txt')

    await history.blameTab.click()
    await sillygit.details.listedFile('Unstaged', 'notes.txt').click()
    await expect(history.root.locator('.commit-fullview-title')).toHaveText('notes.txt')
    await expect(history.blameTab).toHaveAttribute('aria-pressed', 'true')

    await sillygit.details.listedFile('Unstaged', 'hello.txt').click()
    await history.diffTab.click()
    await history.expectClosed()
    await sillygit.workingFile.expectShowing('hello.txt', 'changed')
  })
})

test("a commit's files sit right of its diff, and its history keeps them there", async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nthere\n')
  repo.writeFile('notes.txt', 'some notes\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'Edit two files')
  await sillygit.openRepository(repo.path)
  await sillygit.details.openFile('hello.txt')

  const commit = sillygit.commitView
  await commit.expectShowing('hello.txt', 'there')
  const files = await commit.file('notes.txt').boundingBox()
  const diff = await commit.diff.boundingBox()
  expect(diff!.x + diff!.width).toBeLessThanOrEqual(files!.x + 1)

  await commit.diff.getByRole('button', { name: 'History', exact: true }).click()
  const history = sillygit.fileHistory
  await history.expectHistory(['Edit two files', 'Add hello.txt'])
  await expect(sillygit.details.activeFile).toContainText('hello.txt')

  await sillygit.details.openFile('notes.txt')
  await history.expectHistory(['Edit two files'])
  await expect(history.root.locator('.commit-fullview-title')).toHaveText('notes.txt')

  await history.diffTab.click()
  await commit.expectShowing('notes.txt', 'some notes')
})
