import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../fixtures'

test.describe('browse files at any commit', () => {
  test('lists every file at a commit and opens one it did not change', async ({ sillygit, repo }) => {
    repo.commitFile('src/lib/util.ts', 'export const answer = 42\n', 'Add util')
    repo.commitFile('hello.txt', 'hello\nthere\n', 'Change hello')
    repo.commitFile('README.md', '# Changed later\n', 'Change the readme')
    await sillygit.openRepository(repo.path)
    // The newest commit starts selected, and clicking a selected row deselects it.
    await sillygit.graph.select('Initial commit')
    await sillygit.graph.select('Change hello')

    const details = sillygit.details
    await details.showTab('Files')
    await expect(details.treeFolder('src')).toHaveAttribute('aria-expanded', 'false')
    // The file this commit changed carries its mark; the others don't.
    await expect(details.file('hello.txt').locator('.status-code')).toHaveText('M')
    await expect(details.file('README.md').locator('.status-code')).toHaveCount(0)

    await details.treeFolder('src').click()
    await details.treeFolder('lib').click()
    await expect(details.file('util.ts')).toBeVisible()

    // A file the commit didn't change opens as it was then, not as it is now.
    await details.openFile('README.md')
    const view = sillygit.commitView
    await expect(view.treeFile).toContainText('Unchanged in')
    await expect(view.treeFile.getByTestId('tree-file-content')).toContainText('# Fixture repo')
    await expect(details.activeFile).toContainText('README.md')

    // A changed file still opens its diff.
    await details.openFile('hello.txt')
    await expect(view.treeFile).toHaveCount(0)
    await expect(view.diff).toContainText('there')

    // The tab and the open folders stay put when stepping to another commit.
    await view.backButton.click()
    await sillygit.graph.select('Add util')
    await expect(details.file('util.ts').locator('.status-code')).toHaveText('A')

    // Filtering lists matching files by their full path.
    await details.treeFilter.fill('util')
    await expect(details.tree.locator('.file-row')).toHaveText([/src\/lib\/util\.ts/])
  })

  test('saves a file as it was at a commit and blames from there', async ({ sillygit, repo, electronApp }) => {
    repo.commitFile('hello.txt', 'hello\nthere\n', 'Change hello')
    await sillygit.openRepository(repo.path)
    await sillygit.graph.select('Initial commit')
    await sillygit.graph.select('Change hello')
    await sillygit.details.showTab('Files')

    const out = mkdtempSync(join(tmpdir(), 'sillygit-e2e-save-'))
    try {
      const dest = join(out, 'README-old.md')
      await electronApp.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = (async () => ({ canceled: false, filePath })) as typeof dialog.showSaveDialog
      }, dest)
      await sillygit.details.fileMenu('README.md', 'Save as…')
      await expect(sillygit.details.root.getByRole('status')).toContainText(`Saved to ${dest}`)
      expect(readFileSync(dest, 'utf8')).toBe('# Fixture repo\n')
    } finally {
      rmSync(out, { recursive: true, force: true })
    }

    await sillygit.details.fileMenu('README.md', 'Blame')
    await expect(sillygit.fileHistory.gutter(1)).toContainText('Initial commit')
  })
})
