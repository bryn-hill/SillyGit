import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==', 'base64')

test.describe('Git LFS', () => {
  test('badges LFS files in the working changes and a commit', async ({ sillygit, repo }) => {
    repo.trackWithLfs('*.dat')
    repo.commitFile('notes.dat', 'one\ntwo\n', 'Add notes')
    repo.writeFile('notes.dat', 'one\n2\n')
    repo.writeFile('hello.txt', 'hello\nthere\n')
    await sillygit.openRepository(repo.path)

    const { details } = sillygit
    await expect(details.lfsBadge(details.listedFile('Unstaged', 'notes.dat'))).toBeVisible()
    await expect(details.lfsBadge(details.listedFile('Unstaged', 'hello.txt'))).toHaveCount(0)

    await sillygit.graph.select('Add notes')
    await expect(details.lfsBadge(details.file('notes.dat'))).toBeVisible()
  })

  test("shows an LFS file's real change, or its pointer", async ({ sillygit, repo }) => {
    repo.trackWithLfs('*.dat')
    repo.commitFile('notes.dat', 'one\ntwo\n', 'Add notes')
    repo.writeFile('notes.dat', 'one\n2\n')
    await sillygit.openRepository(repo.path)
    await sillygit.details.listedFile('Unstaged', 'notes.dat').click()

    const diff = sillygit.workingFile.diff
    const lfs = diff.getByRole('group', { name: 'Git LFS' })
    await expect(lfs).toContainText('Showing the files the LFS pointers stand for')
    await expect(diff).toContainText('two')
    // The real change can't be staged a hunk at a time: git stores the pointer.
    await expect(sillygit.workingFile.hunkButton(/Stage/)).toHaveCount(0)

    await lfs.getByRole('button', { name: 'Pointer' }).click()
    await expect(diff).toContainText('oid sha256:')
    await expect(sillygit.workingFile.hunkButton(/Stage/)).toHaveCount(1)
    await lfs.getByRole('button', { name: 'File contents' }).click()
    await expect(diff).not.toContainText('oid sha256:')
  })

  test('draws an LFS image rather than its pointer', async ({ sillygit, repo }) => {
    repo.trackWithLfs('*.png')
    repo.commitFile('pic.png', PNG, 'Add picture')
    await sillygit.openRepository(repo.path)
    await sillygit.graph.select('Add hello.txt')
    await sillygit.graph.select('Add picture')
    await sillygit.details.openFile('pic.png')

    const image = sillygit.commitView.diff.getByRole('figure', { name: 'Image diff' })
    await expect(image.getByRole('img', { name: 'pic.png after' })).toBeVisible()
    await expect(image).toContainText('4 × 3')
  })

  test('tracks a file type with LFS from its right-click menu', async ({ sillygit, repo }) => {
    repo.writeFile('art/hero.psd', 'layers')
    await sillygit.openRepository(repo.path)

    await sillygit.details.listedFile('Unstaged', 'art/hero.psd').click({ button: 'right' })
    await sillygit.page.getByRole('menu').getByText('Track with LFS').hover()
    await sillygit.page.getByRole('menuitem', { name: 'All *.psd files' }).click()

    await expect(sillygit.notice).toContainText('Tracking *.psd with Git LFS')
    expect(repo.readFile('.gitattributes')).toContain('*.psd filter=lfs diff=lfs merge=lfs -text')
    await expect(sillygit.details.lfsBadge(sillygit.details.listedFile('Unstaged', 'art/hero.psd'))).toBeVisible()
  })

  test('fetches, pulls and prunes LFS files from the Actions list', async ({ sillygit, repo }) => {
    repo.trackWithLfs('*.dat')
    await sillygit.openRepository(repo.path)

    await sillygit.actionsButton.click()
    await expect(sillygit.actions.getByRole('option', { name: 'Git LFS: Fetch files' })).toBeVisible()
    await expect(sillygit.actions.getByRole('option', { name: 'Git LFS: Pull files' })).toBeVisible()
    await sillygit.actions.getByRole('option', { name: 'Git LFS: Prune old files' }).click()
    await expect(sillygit.notice).toContainText('Pruned old Git LFS files')
  })

  test("says so when the repo uses LFS and git-lfs isn't installed", async ({ sillygit, repo, electronApp }) => {
    repo.trackWithLfs('*.dat')
    repo.commitFile('notes.dat', 'one\n', 'Add notes')
    repo.writeFile('notes.dat', 'two\n')
    repo.writeFile('model.bin', 'weights')
    await stubIpc(electronApp, 'lfs:info', { ok: true, data: { installed: false, version: null, patterns: ['*.dat'] } })
    await sillygit.openRepository(repo.path)

    const banner = sillygit.page.getByRole('status', { name: 'Git LFS not installed' })
    await expect(banner).toContainText("git-lfs isn’t installed")
    await expect(banner.getByRole('button', { name: 'Get Git LFS' })).toBeVisible()

    await sillygit.details.listedFile('Unstaged', 'notes.dat').click()
    const lfs = sillygit.workingFile.diff.getByRole('group', { name: 'Git LFS' })
    await expect(lfs).toContainText("Git LFS isn't installed")
    await expect(lfs.getByRole('button', { name: 'File contents' })).toHaveCount(0)
    await expect(sillygit.workingFile.diff).toContainText('oid sha256:')


    await sillygit.actionsButton.click()
    await expect(sillygit.actions.getByRole('option', { name: 'Git LFS: Install git-lfs…' })).toBeVisible()
    await expect(sillygit.actions.getByRole('option', { name: 'Git LFS: Pull files' })).toHaveCount(0)
    await sillygit.page.keyboard.press('Escape')

    await banner.getByRole('button', { name: 'Dismiss' }).click()
    await expect(banner).toHaveCount(0)

    await sillygit.details.listedFile('Unstaged', 'model.bin').click({ button: 'right' })
    await expect(sillygit.page.getByRole('menuitem', { name: 'Track with LFS' })).toHaveAttribute('aria-disabled', 'true')
  })
})
