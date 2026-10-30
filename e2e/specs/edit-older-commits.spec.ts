import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'

const subjects = (repo: FixtureRepo): string[] => repo.git('log', '--format=%s').trim().split('\n')

test.describe('editing older commits in place', () => {
  test.beforeEach(({ repo }) => {
    repo.commitFile('one.txt', 'one\n', 'Add one')
    repo.commitFile('two.txt', 'two\n', 'Add two')
    repo.commitFile('three.txt', 'three\n', 'Add three')
  })

  test('reword a commit from its menu', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.graph.row('Add one').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Reword commit message…' }).click()
    const dialog = sillygit.page.getByRole('dialog', { name: /^Reword / })
    const message = dialog.getByRole('textbox', { name: 'Commit message' })
    await expect(message).toHaveValue('Add one')
    await message.fill('Add the first file\n\nWith a body')
    await message.press('ControlOrMeta+Enter')

    await expect(sillygit.notice).toContainText('Reworded')
    expect(subjects(repo)).toEqual(['Add three', 'Add two', 'Add the first file', 'Add hello.txt', 'Initial commit'])
    expect(repo.git('log', '-1', '--format=%b', 'HEAD~2').trim()).toBe('With a body')
  })

  test('move a commit down, and the tip cannot move up', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.graph.row('Add three').click({ button: 'right' })
    await expect(sillygit.page.getByRole('menuitem', { name: /Move commit up/ })).toHaveCount(0)
    await sillygit.page.getByRole('menuitem', { name: 'Move commit down (earlier)' }).click()

    await expect(sillygit.notice).toContainText('Moved')
    expect(subjects(repo)).toEqual(['Add two', 'Add three', 'Add one', 'Add hello.txt', 'Initial commit'])
    await sillygit.graph.expectSubjects(['Add two', 'Add three', 'Add one', 'Add hello.txt', 'Initial commit'])
  })

  test('drag a commit onto another to squash it', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.graph.dragCommitOntoCommit('Add three', 'Add one')
    const three = repo.git('rev-parse', '--short=7', 'HEAD').trim()
    const one = repo.git('rev-parse', '--short=7', 'HEAD~2').trim()
    await sillygit.graph.dropMenu.getByRole('menuitem', { name: `Squash ${three} into ${one}` }).click()

    await expect(sillygit.notice).toContainText('Squashed')
    expect(subjects(repo)).toEqual(['Add two', 'Add one', 'Add hello.txt', 'Initial commit'])
    expect(repo.git('log', '-1', '--format=%B', 'HEAD~1').trim()).toBe('Add one\n\nAdd three')
    expect(repo.git('show', '--format=', '--name-only', 'HEAD~1').trim().split('\n')).toEqual(['one.txt', 'three.txt'])
  })

  test('uncommit a file from a commit’s file list', async ({ sillygit, repo }) => {
    repo.writeFile('two.txt', 'two, edited\n')
    repo.writeFile('debug.log', 'debug\n')
    repo.git('add', '-A')
    repo.git('commit', '-q', '-m', 'Edit two')
    await sillygit.openRepository(repo.path)

    // The tip is selected on open, and clicking a selected commit closes it, so go via another.
    await sillygit.graph.select('Add three')
    await sillygit.graph.select('Edit two')
    await sillygit.details.fileMenu('debug.log', 'Uncommit this file')

    await expect(sillygit.notice).toContainText('Took debug.log out of')
    expect(repo.git('show', '--format=', '--name-only', 'HEAD').trim()).toBe('two.txt')
    expect(repo.readFile('debug.log')).toBe('debug\n')
    expect(repo.git('status', '--porcelain')).toBe('A  debug.log\n')
  })

  test('uncommit one hunk from a commit’s diff', async ({ sillygit, repo }) => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    repo.commitFile('big.txt', lines.join('\n') + '\n', 'Add big')
    lines[1] = 'line 2 changed'
    lines[17] = 'line 18 changed'
    repo.commitFile('big.txt', lines.join('\n') + '\n', 'Change big')
    repo.commitFile('after.txt', 'after\n', 'Add after')
    await sillygit.openRepository(repo.path)

    await sillygit.graph.select('Change big')
    await sillygit.details.openFile('big.txt')
    await sillygit.commitView.diff.getByRole('button', { name: /Uncommit Hunk/ }).last().click()

    await expect(sillygit.notice).toContainText('Took that change out of')
    const diff = repo.git('show', '--format=', 'HEAD~1')
    expect(diff).toContain('+line 2 changed')
    expect(diff).not.toContain('line 18 changed')
    expect(repo.git('diff')).toContain('+line 18 changed')
  })
})
