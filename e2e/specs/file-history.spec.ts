import { expect, test } from '../fixtures'

test.describe('blame and file history', () => {
  test('blames a file from the Actions list, including uncommitted lines', async ({ sillygit, repo }) => {
    repo.commitFile('hello.txt', 'hello\nworld\nagain\n', 'Add a third line')
    repo.writeFile('hello.txt', 'hello\nworld\nagain\nnot yet\n')
    await sillygit.openRepository(repo.path)

    await sillygit.actionsButton.click()
    await sillygit.actions.getByRole('option', { name: 'Blame file' }).click()
    await sillygit.actions.getByRole('option', { name: 'hello.txt', exact: true }).click()

    const view = sillygit.fileHistory
    await expect(view.blameTab).toHaveAttribute('aria-pressed', 'true')
    await expect(sillygit.graph.root).toBeHidden()
    await expect(view.gutter(1)).toContainText('Add hello.txt')
    await expect(view.gutter(1)).toContainText('E2E Tester')
    // Line 2 is from the same commit, so only the block's first line is labelled.
    await expect(view.gutter(2)).toHaveText('')
    await expect(view.gutter(3)).toContainText('Add a third line')
    await expect(view.gutter(4)).toContainText('Uncommitted changes')

    // Clicking a line shows its commit in the file's history.
    await view.gutter(3).click()
    await view.expectHistory(['Add a third line', 'Add hello.txt'])
    await expect(view.activeEntry).toContainText('Add a third line')
    await expect(view.diff).toContainText('again')

    await view.closeButton.click()
    await view.expectClosed()
    await expect(sillygit.graph.root).toBeVisible()
  })

  test('follows a file through a rename and shows the rename as one change', async ({ sillygit, repo }) => {
    const lines = ['hello', 'world', 'three', 'four', 'five', 'six', 'seven', 'eight']
    repo.commitFile('hello.txt', lines.join('\n') + '\n', 'Grow hello')
    repo.git('mv', 'hello.txt', 'greeting.txt')
    repo.writeFile('greeting.txt', ['hello', 'world!', ...lines.slice(2)].join('\n') + '\n')
    repo.git('add', '-A')
    repo.git('commit', '-q', '-m', 'Rename hello to greeting')
    await sillygit.openRepository(repo.path)
    // The newest commit starts selected, and clicking a selected row deselects it.
    await sillygit.graph.select('Initial commit')
    await sillygit.graph.select('Rename hello to greeting')

    await sillygit.details.fileMenu('greeting.txt', 'File history')

    const view = sillygit.fileHistory
    await view.expectHistory(['Rename hello to greeting', 'Grow hello', 'Add hello.txt'])
    await expect(view.entry('Rename hello to greeting')).toContainText('Renamed from hello.txt')
    await expect(view.diff).toContainText('world!')
    // A rename diff, not the whole file added.
    await expect(view.diff.locator('.diff-row-add')).toHaveCount(1)

    await view.entry('Add hello.txt').click()
    await expect(view.diff.locator('.diff-row-add')).toHaveCount(2)
  })

  test('steps back past a change and jumps to the commit in the graph', async ({ sillygit, repo }) => {
    repo.commitFile('hello.txt', 'hello\nthere\n', 'Change the second line')
    await sillygit.openRepository(repo.path)
    // The newest commit starts selected, and clicking a selected row deselects it.
    await sillygit.graph.select('Initial commit')
    await sillygit.graph.select('Change the second line')
    await sillygit.details.openFile('hello.txt')

    await sillygit.commitView.diff.getByRole('button', { name: 'Blame', exact: true }).click()

    const view = sillygit.fileHistory
    await expect(view.gutter(2)).toContainText('Change the second line')
    await view.lineMenu(2, 'Blame before this change')
    await expect(view.gutter(1)).toContainText('Add hello.txt')
    await expect(view.blame).toContainText('world')
    await expect(view.blameBar.getByRole('button', { name: /^Back to/ })).toBeVisible()

    await view.lineMenu(2, 'Show in graph')
    await view.expectClosed()
    await sillygit.graph.expectSelected('Add hello.txt')
  })
})
