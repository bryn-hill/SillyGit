import { expect, test } from '../fixtures'

test('clicking a stash lists its files, untracked ones too, and shows their diffs', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nstashed line\n')
  repo.writeFile('notes.txt', 'brand new\n')
  repo.git('stash', 'push', '--include-untracked', '-m', 'half done')
  await sillygit.openRepository(repo.path)

  const stashes = sillygit.page.getByRole('list', { name: 'Stashes' })
  await stashes.getByRole('listitem').filter({ hasText: 'half done' }).click()

  const stash = sillygit.details.root.getByRole('region', { name: 'Stash' })
  await expect(stash.getByTestId('stash-subject')).toHaveText('half done')
  await expect(stash).toContainText('Stashed on main')
  await expect(stash.getByRole('list', { name: 'Stashed changes' })).toHaveText([/hello\.txt/])
  await expect(stash.getByRole('list', { name: 'Stashed untracked files' })).toHaveText([/notes\.txt/])

  await sillygit.details.file('hello.txt').click()
  const diff = sillygit.page.getByRole('region', { name: 'Stash diff' })
  await expect(diff).toContainText('stashed line')
  // A stash's diff is only to look at.
  await expect(diff.getByRole('button', { name: /Revert/ })).toHaveCount(0)

  await sillygit.details.file('notes.txt').click()
  await expect(diff).toContainText('brand new')

  // Popping it from the panel brings the changes back and leaves the stash.
  await stash.getByRole('button', { name: 'Pop' }).click()
  await expect(stashes.getByRole('listitem')).toHaveText(['No stashes'])
  await expect(diff).toHaveCount(0)
  expect(repo.readFile('notes.txt')).toBe('brand new\n')
})

test('Stash… stashes only the picked files and can keep the staged ones', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nchanged\n')
  repo.writeFile('README.md', '# Changed\n')
  repo.git('add', 'README.md')
  repo.writeFile('notes.txt', 'new\n')
  await sillygit.openRepository(repo.path)

  await sillygit.details.root.getByRole('button', { name: 'Stash…' }).click()
  const dialog = sillygit.page.getByRole('dialog', { name: 'Stash changes' })
  const files = dialog.getByRole('list', { name: 'Files to stash' })
  await expect(files.getByRole('checkbox')).toHaveCount(3)
  await files.getByRole('listitem').filter({ hasText: 'README.md' }).getByRole('checkbox').uncheck()
  await dialog.getByRole('textbox', { name: 'Stash message' }).fill('just two')
  await dialog.getByRole('button', { name: 'Stash 2 files' }).click()

  const stashes = sillygit.page.getByRole('list', { name: 'Stashes' })
  await expect(stashes.getByRole('listitem')).toHaveText([/just two/])
  expect(repo.git('status', '--porcelain').trim()).toBe('M  README.md')

  // Keep index: everything stashed, the staged change stays.
  repo.writeFile('hello.txt', 'hello\nagain\n')
  await expect(sillygit.details.listedFile('Unstaged', 'hello.txt')).toBeVisible()
  await sillygit.details.root.getByRole('button', { name: 'Stash…' }).click()
  await dialog.getByRole('checkbox', { name: 'Keep staged changes in the working tree too' }).check()
  await dialog.getByRole('button', { name: 'Stash all changes' }).click()
  await expect(stashes.getByRole('listitem')).toHaveCount(2)
  expect(repo.git('status', '--porcelain').trim()).toBe('M  README.md')
})

test('Stash this file… from a file menu starts with just that file picked', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nchanged\n')
  repo.writeFile('README.md', '# Changed\n')
  await sillygit.openRepository(repo.path)

  await sillygit.details.listedFile('Unstaged', 'hello.txt').click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: 'Stash this file…' }).click()
  const dialog = sillygit.page.getByRole('dialog', { name: 'Stash changes' })
  await dialog.getByRole('button', { name: 'Stash 1 file' }).click()

  await expect.poll(() => repo.git('status', '--porcelain').trim()).toBe('M README.md')
  expect(repo.git('stash', 'show', '--name-only', 'stash@{0}').trim()).toBe('hello.txt')
})
