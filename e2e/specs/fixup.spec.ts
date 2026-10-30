import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'

const subjects = (repo: FixtureRepo): string[] => repo.git('log', '--format=%s').trim().split('\n')

test.describe('folding staged changes into earlier commits', () => {
  test.beforeEach(({ repo }) => {
    repo.commitFile('one.txt', 'one\n', 'Add one')
    repo.commitFile('two.txt', 'two\n', 'Add two')
  })

  test('fix up a commit from its right-click menu', async ({ sillygit, repo }) => {
    repo.writeFile('one.txt', 'one, fixed\n')
    repo.git('add', 'one.txt')
    await sillygit.openRepository(repo.path)

    await sillygit.graph.row('Add one').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Fix up this commit with staged changes' }).click()

    await expect(sillygit.notice).toContainText('Folded the staged changes into')
    expect(subjects(repo)).toEqual(['Add two', 'Add one', 'Add hello.txt', 'Initial commit'])
    expect(repo.git('status', '--porcelain')).toBe('')
    expect(repo.git('show', 'HEAD~1:one.txt')).toBe('one, fixed\n')
  })

  test('fix up is not offered with nothing staged', async ({ sillygit, repo }) => {
    repo.writeFile('one.txt', 'one, fixed\n')
    await sillygit.openRepository(repo.path)

    await sillygit.graph.row('Add one').click({ button: 'right' })
    await expect(sillygit.page.getByRole('menuitem', { name: /Fix up/ })).toHaveCount(0)
  })

  test('absorb sends each staged change to the commit that made those lines', async ({ sillygit, repo }) => {
    repo.writeFile('one.txt', 'ONE\n')
    repo.writeFile('two.txt', 'TWO\n')
    repo.writeFile('new.txt', 'brand new\n')
    repo.git('add', '-A')
    await sillygit.openRepository(repo.path)

    await sillygit.details.root.getByRole('button', { name: 'Absorb…' }).click()
    const dialog = sillygit.page.getByRole('dialog', { name: 'Absorb staged changes' })
    await expect(dialog.getByRole('combobox', { name: /one\.txt/ })).toContainText('Add one')
    await expect(dialog.getByRole('combobox', { name: /two\.txt/ })).toContainText('Add two')
    await expect(dialog.getByRole('combobox', { name: /new\.txt/ })).toContainText('Leave staged')
    await expect(dialog).toContainText('New file')

    await dialog.getByRole('button', { name: 'Absorb into 2 commits' }).click()

    await expect(sillygit.notice).toContainText('Absorbed the staged changes into 2 commits')
    expect(subjects(repo)).toEqual(['Add two', 'Add one', 'Add hello.txt', 'Initial commit'])
    // new.txt had no commit to go into, so it's still staged.
    expect(repo.git('status', '--porcelain')).toBe('A  new.txt\n')
    expect(repo.git('show', 'HEAD:two.txt')).toBe('TWO\n')
    expect(repo.git('show', 'HEAD~1:one.txt')).toBe('ONE\n')
  })
})
