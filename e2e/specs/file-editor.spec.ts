import { expect, test } from '../fixtures'

test.describe('editing a changed file in the app', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    repo.writeFile('hello.txt', 'hello\nworld\nchanged\n')
    await sillygit.openRepository(repo.path)
    await sillygit.details.editFile('hello.txt')
    await sillygit.editor.expectOpen('hello.txt', 'changed')
  })

  test('Cmd+S saves to disk and the working changes refresh', async ({ sillygit, repo }) => {
    const editor = sillygit.editor
    await editor.appendText('typed in monaco')
    await expect(editor.unsavedMarker).toBeVisible()

    await editor.saveWithShortcut()

    await expect(editor.status).toHaveText('Saved')
    await expect(editor.unsavedMarker).toHaveCount(0)
    expect(repo.readFile('hello.txt')).toBe('hello\nworld\nchanged\ntyped in monaco')
    await editor.closeButton.click()
    await editor.expectClosed()
    await sillygit.details.file('hello.txt').click()
    await expect(sillygit.details.root.locator('.inline-diff')).toContainText('typed in monaco')
  })

  test('closing with unsaved changes asks first', async ({ sillygit, repo }) => {
    const editor = sillygit.editor
    await editor.appendText('never saved')

    sillygit.page.once('dialog', (dialog) => void dialog.dismiss())
    await editor.closeButton.click()
    await expect(editor.root).toBeVisible()

    sillygit.page.once('dialog', (dialog) => void dialog.accept())
    await editor.closeButton.click()
    await editor.expectClosed()
    expect(repo.readFile('hello.txt')).toBe('hello\nworld\nchanged\n')
  })

  test('opens in the main window beside the details panel', async ({ sillygit }) => {
    await expect(sillygit.details.root).toBeVisible()
    await expect(sillygit.graph.root).toBeHidden()

    await sillygit.editor.closeButton.click()

    await sillygit.editor.expectClosed()
    await expect(sillygit.graph.root).toBeVisible()
  })

  test('unsaved edits survive a trip to Launchpad', async ({ sillygit, repo }) => {
    await sillygit.editor.appendText('still here')
    await sillygit.tabs.launchpad.click()
    await sillygit.editor.expectClosed()

    await sillygit.tabs.tab(repo.name).click()

    await sillygit.editor.expectOpen('hello.txt', 'still here')
    await expect(sillygit.editor.unsavedMarker).toBeVisible()
    expect(repo.readFile('hello.txt')).toBe('hello\nworld\nchanged\n')
  })

  test('typing in the editor does not drive the app shortcuts', async ({ sillygit }) => {
    await sillygit.editor.code.click()
    await sillygit.page.keyboard.press('Escape')
    await sillygit.page.keyboard.press('ArrowDown')
    await expect(sillygit.editor.root).toBeVisible()
    await expect(sillygit.page.getByRole('dialog', { name: /command/i })).toHaveCount(0)
  })
})

test('the diff view Edit file button opens the in-app editor', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.details.openFile('hello.txt')
  await sillygit.commitView.expectShowing('hello.txt', 'world')

  await sillygit.commitView.diff.getByRole('button', { name: 'Edit file' }).click()

  await sillygit.editor.expectOpen('hello.txt', 'world')
  await expect(sillygit.editor.externalButton).toBeVisible()
  await sillygit.page.keyboard.press('ControlOrMeta+S')
  await sillygit.editor.closeButton.click()
  await sillygit.editor.expectClosed()
  await expect(sillygit.commitView.root).toBeVisible()
})

test('binary files are not opened for editing', async ({ sillygit, repo }) => {
  repo.writeFile('logo.bin', Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]))
  await sillygit.openRepository(repo.path)
  await sillygit.details.editFile('logo.bin')

  await expect(sillygit.editor.root).toContainText("is a binary file (0 KB) and can't be edited here")
  await expect(sillygit.editor.saveButton).toHaveCount(0)
})
