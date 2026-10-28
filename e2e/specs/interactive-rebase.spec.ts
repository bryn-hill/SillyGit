import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'
import type { SillyGitApp } from '../pages/SillyGitApp'

/** Three commits on main after "Add hello.txt", each adding a file. */
function addStack(repo: FixtureRepo): void {
  repo.commitFile('one.txt', '1\n', 'Add one')
  repo.commitFile('two.txt', '2\n', 'Add two')
  repo.commitFile('three.txt', '3\n', 'Add three')
}

async function openRebase(sillygit: SillyGitApp, from: string): Promise<void> {
  await sillygit.graph.row(from).click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: 'Interactive rebase main to here…' }).click()
  await expect(sillygit.rebase.root).toBeVisible()
}

const subjects = (repo: FixtureRepo): string[] => repo.git('log', '--format=%s').trim().split('\n')

test.describe('interactive rebase', () => {
  test('is offered on commits below HEAD only, and lists the commits after the one chosen', async ({ sillygit, repo }) => {
    addStack(repo)
    await sillygit.openRepository(repo.path)

    await sillygit.graph.row('Add three').click({ button: 'right' })
    await expect(sillygit.page.getByRole('menuitem', { name: /Interactive rebase/ })).toHaveCount(0)
    await sillygit.page.keyboard.press('Escape')

    await openRebase(sillygit, 'Add hello.txt')
    await sillygit.rebase.expectSubjects(['Add three', 'Add two', 'Add one'])
    await expect(sillygit.rebase.root).toContainText('main onto')
    // Nothing changed yet, so there is nothing to start.
    await expect(sillygit.rebase.startButton).toBeDisabled()

    await sillygit.rebase.cancelButton.click()
    await expect(sillygit.rebase.root).toBeHidden()
    await sillygit.graph.expectSubjects(['Add three', 'Add two', 'Add one', 'Add hello.txt', 'Initial commit'])
  })

  test('reorders by dragging and drops, squashes and rewords commits', async ({ sillygit, repo }) => {
    addStack(repo)
    repo.commitFile('four.txt', '4\n', 'Add four')
    await sillygit.openRepository(repo.path)
    await openRebase(sillygit, 'Add hello.txt')
    const rebase = sillygit.rebase

    await rebase.dragAbove('Add one', 'Add four')
    await rebase.expectSubjects(['Add one', 'Add four', 'Add three', 'Add two'])
    await rebase.move('Add two', 'up')
    await rebase.expectSubjects(['Add one', 'Add four', 'Add two', 'Add three'])

    await rebase.setAction('Add three', 'Drop')
    // Squash "Add four" into "Add two" below it; the message combines both.
    await rebase.setAction('Add four', 'Squash')
    await expect(rebase.row('Add four')).toContainText('into')
    await expect(rebase.message).toHaveValue('Add two\n\nAdd four')
    await rebase.message.fill('Add two and four')
    await rebase.setAction('Add one', 'Reword')
    await rebase.message.fill('Add one, last')
    await expect(rebase.summary).toHaveText('4 commits → 2')

    await rebase.startButton.click()
    await expect(rebase.root).toBeHidden()
    await expect(sillygit.notice).toContainText('Rebased main: 4 commits became 2.')
    await sillygit.graph.expectSubjects(['Add one, last', 'Add two and four', 'Add hello.txt', 'Initial commit'])
    expect(subjects(repo)).toEqual(['Add one, last', 'Add two and four', 'Add hello.txt', 'Initial commit'])
    expect(repo.git('ls-tree', '--name-only', 'HEAD').trim().split('\n')).not.toContain('three.txt')
  })

  test('changes actions with the keyboard and explains a plan that cannot run', async ({ sillygit, repo }) => {
    addStack(repo)
    await sillygit.openRepository(repo.path)
    await openRebase(sillygit, 'Add hello.txt')
    const rebase = sillygit.rebase

    await rebase.row('Add one').locator('.rebase-hash').click()
    await rebase.row('Add one').press('f')
    await expect(rebase.row('Add one')).toHaveAttribute('data-action', 'fixup')
    await expect(rebase.error).toContainText("The oldest commit can't be fixed up")
    await expect(rebase.startButton).toBeDisabled()

    await rebase.row('Add one').press('d')
    await expect(rebase.error).toBeHidden()
    await rebase.row('Add one').press('ArrowUp')
    await rebase.row('Add two').press('f')
    await expect(rebase.error).toContainText("can't be fixed up")
    await rebase.row('Add two').press('p')
    await rebase.startButton.click()
    await sillygit.graph.expectSubjects(['Add three', 'Add two', 'Add hello.txt', 'Initial commit'])
  })

  test('stops on a conflict, resolves it in the side bar and keeps the new message', async ({ sillygit, repo }) => {
    repo.commitFile('notes.txt', 'one\n', 'Notes one')
    repo.commitFile('notes.txt', 'two\n', 'Notes two')
    await sillygit.openRepository(repo.path)
    await openRebase(sillygit, 'Add hello.txt')
    const rebase = sillygit.rebase

    // "Notes two" before the commit that creates the file can't apply cleanly.
    await rebase.move('Notes two', 'down')
    await rebase.setAction('Notes two', 'Reword')
    await rebase.message.fill('Notes, reworded')
    await rebase.startButton.click()

    await expect(rebase.root).toBeHidden()
    await sillygit.conflicts.expectConflicts('Rebase conflicts detected', /Rebasing main onto [0-9a-f]{7} \(commit 1 of 2\)/, [
      'notes.txt'
    ])
    await sillygit.conflicts.fileMenu('notes.txt', /^Take incoming/)
    await sillygit.conflicts.button('Continue Rebase').click()

    await sillygit.conflicts.expectConflicts('Rebase conflicts detected', /commit 2 of 2/, ['notes.txt'])
    await sillygit.conflicts.fileMenu('notes.txt', /^Take incoming/)
    await sillygit.conflicts.button('Continue Rebase').click()

    await sillygit.graph.expectSubjects(['Notes one', 'Notes, reworded', 'Add hello.txt', 'Initial commit'])
    expect(repo.readFile('notes.txt')).toBe('one\n')
  })

  test('aborting a stopped rebase puts the branch back', async ({ sillygit, repo }) => {
    repo.commitFile('notes.txt', 'one\n', 'Notes one')
    repo.commitFile('notes.txt', 'two\n', 'Notes two')
    const head = repo.git('rev-parse', 'HEAD').trim()
    await sillygit.openRepository(repo.path)
    await openRebase(sillygit, 'Add hello.txt')
    await sillygit.rebase.move('Notes two', 'down')
    await sillygit.rebase.startButton.click()
    await sillygit.conflicts.expectConflicts('Rebase conflicts detected', /commit 1 of 2/, ['notes.txt'])

    sillygit.page.once('dialog', (d) => d.accept())
    await sillygit.conflicts.button('Abort Rebase').click()
    await sillygit.conflicts.expectNoConflictedFiles()
    await expect.poll(() => repo.git('rev-parse', 'HEAD').trim()).toBe(head)
  })
})
