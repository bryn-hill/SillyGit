import { expect, test } from '../fixtures'
import type { SillyGitApp } from '../pages/SillyGitApp'

const NOTES = (second: string, eighth: string): string[] => [
  'one',
  second,
  'three',
  'four',
  'five',
  'six',
  'seven',
  eighth,
  'nine',
  'ten'
]

async function startConflictingMerge(sillygit: SillyGitApp): Promise<void> {
  await sillygit.sidebar.branchMenu('feature', 'Merge feature into main')
  await sillygit.conflicts.expectConflicts('Merge conflicts detected', 'Merging feature into main', ['notes.txt'])
}

test.describe('merging a branch with conflicts', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    repo.addConflictingBranch()
    await sillygit.openRepository(repo.path)
    await startConflictingMerge(sillygit)
  })

  test('shows the conflict state on the WIP node and in the side bar', async ({ sillygit }) => {
    await expect(sillygit.graph.rows.first()).toContainText(
      'A file conflict was found when attempting to merge into main'
    )
    await expect(sillygit.conflicts.button('Commit and Merge')).toBeDisabled()
    await expect(sillygit.conflicts.button('Abort Merge')).toBeEnabled()
  })

  test('resolves hunks and lines in the merge tool, then commits the merge', async ({ sillygit, repo }) => {
    await sillygit.conflicts.openFile('notes.txt')
    const tool = sillygit.mergeTool
    await expect(tool.current).toContainText('two (main)')
    await expect(tool.incoming).toContainText('two (feature)')
    // Unpicked conflicts show the ancestor's text.
    await tool.expectOutput(NOTES('two', 'eight'))
    await expect(tool.position).toHaveText('conflict 1 of 2')

    await tool.takeHunk('B', 1)
    await tool.takeHunk('A', 1)
    await tool.toggleLine('A', 8)
    // Picks land in click order: B's hunk, then A's.
    await tool.expectOutput(['one', 'two (feature)', 'two (main)', ...NOTES('', 'eight (main)').slice(2)])

    await tool.toggleLine('B', 2)
    await tool.saveWithShortcut()
    await tool.expectClosed()

    await sillygit.conflicts.expectNoConflictedFiles()
    expect(repo.readFile('notes.txt')).toBe(NOTES('two (main)', 'eight (main)').join('\n') + '\n')

    // The commit message is prefilled with git's merge message.
    await expect(sillygit.page.getByPlaceholder('Commit message')).toHaveValue("Merge branch 'feature'")
    await sillygit.conflicts.button('Commit and Merge').click()
    await expect(sillygit.graph.rows.first()).toContainText("Merge branch 'feature'")
    expect(repo.git('rev-list', '--parents', '-1', 'HEAD').trim().split(' ')).toHaveLength(3)
  })

  test('asks how to save when conflicts are left unpicked', async ({ sillygit, repo }) => {
    await sillygit.conflicts.openFile('notes.txt')
    const tool = sillygit.mergeTool
    await tool.takeHunk('A', 1)
    await tool.saveButton.click()
    await expect(tool.unresolvedPrompt).toBeVisible()

    await tool.unresolvedPrompt.getByRole('button', { name: 'Create Conflict Chunks' }).click()
    await tool.expectClosed()
    // Markers are written for the unpicked hunk, and the file stays conflicted.
    expect(repo.readFile('notes.txt')).toContain('<<<<<<< main\neight (main)\n=======\neight (feature)\n>>>>>>> feature\n')
    expect(repo.readFile('notes.txt')).toContain('one\ntwo (main)\nthree\n')
    await expect(sillygit.conflicts.file('notes.txt')).toBeVisible()

    await sillygit.conflicts.openFile('notes.txt')
    await tool.takeAll('B')
    await tool.saveButton.click()
    await tool.expectClosed()
    await sillygit.conflicts.expectNoConflictedFiles()
  })

  test('takes the incoming version of a whole file from its menu', async ({ sillygit, repo }) => {
    await sillygit.conflicts.fileMenu('notes.txt', 'Take incoming (feature)')

    await sillygit.conflicts.expectNoConflictedFiles()
    expect(repo.readFile('notes.txt')).toBe(NOTES('two (feature)', 'eight (feature)').join('\n') + '\n')
    await expect(sillygit.conflicts.button('Commit and Merge')).toBeEnabled()
  })

  test('aborting the merge goes back to the branch as it was', async ({ sillygit, repo }) => {
    sillygit.page.once('dialog', (dialog) => dialog.accept())
    await sillygit.conflicts.button('Abort Merge').click()

    await expect(sillygit.conflicts.header).toHaveCount(0)
    await expect(sillygit.graph.workingChangesRow()).toHaveCount(0)
    expect(repo.git('status', '--porcelain')).toBe('')
    expect(repo.git('log', '--format=%s', '-1').trim()).toBe('Edit notes on main')
  })
})

test('rebasing onto a conflicting branch continues once resolved', async ({ sillygit, repo }) => {
  repo.addConflictingBranch()
  await sillygit.openRepository(repo.path)

  await sillygit.sidebar.branchMenu('feature', 'Rebase main onto feature')
  await sillygit.conflicts.expectConflicts(
    'Rebase conflicts detected',
    'Rebasing main onto feature (commit 1 of 1)',
    ['notes.txt']
  )
  await expect(sillygit.graph.rows.first()).toContainText(
    'A file conflict was found when attempting to rebase main onto feature'
  )

  await sillygit.conflicts.fileMenu('notes.txt', /^Take incoming/)
  await sillygit.conflicts.button('Continue Rebase').click()

  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.git('log', '--format=%s', '-3').trim().split('\n')).toEqual([
    'Edit notes on main',
    'Edit notes on feature',
    'Add notes'
  ])
})

test('a cherry-pick conflict uses the same resolve and commit flow', async ({ sillygit, repo }) => {
  repo.addConflictingBranch()
  await sillygit.openRepository(repo.path)

  await sillygit.graph.row('Edit notes on feature').click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: 'Cherry-pick commit' }).click()
  await sillygit.conflicts.expectConflicts(
    'Cherry-pick conflicts detected',
    /Cherry-picking [0-9a-f]{7} Edit notes on feature onto main/,
    ['notes.txt']
  )

  await sillygit.conflicts.fileMenu('notes.txt', /^Take incoming \([0-9a-f]{7} Edit notes on feature\)$/)
  await sillygit.page.getByPlaceholder('Commit message').fill('Pick feature notes')
  await sillygit.conflicts.button('Commit Cherry-pick').click()

  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.git('log', '--format=%s %an', '-1').trim()).toBe('Pick feature notes E2E Tester')
  expect(repo.readFile('notes.txt')).toContain('two (feature)')
})

test('a file deleted on one side offers keep or delete', async ({ sillygit, repo }) => {
  repo.addModifyDeleteBranch()
  await sillygit.openRepository(repo.path)
  await sillygit.sidebar.branchMenu('feature', 'Merge feature into main')
  await sillygit.conflicts.openFile('doomed.txt')

  const prompt = sillygit.page.getByRole('alertdialog', { name: 'Modify/delete conflict' })
  await expect(prompt).toContainText('doomed.txt has been modified on main, but deleted on feature.')
  await prompt.getByRole('button', { name: 'Delete The File' }).click()

  await sillygit.conflicts.expectNoConflictedFiles()
  expect(repo.git('status', '--porcelain').trim()).toBe('D  doomed.txt')
})
