import { expect, test } from '../fixtures'
import type { SillyGitApp } from '../pages/SillyGitApp'
import * as scenario from '../support/mergeScenarios'
import { numbered } from '../support/mergeScenarios'

// The hard merges from support/mergeScenarios.ts, driven through the UI.
// src/main/conflicts.scenarios.*.test.ts cover the same situations below the UI.

async function mergeFeature(sillygit: SillyGitApp, files: string[]): Promise<void> {
  await sillygit.sidebar.branchMenu('feature', 'Merge feature into main')
  await sillygit.conflicts.expectConflicts('Merge conflicts detected', 'Merging feature into main', files)
}

test('an octopus merge in history draws a lane for every parent', async ({ sillygit, repo }) => {
  scenario.octopusHistory(repo)
  await sillygit.openRepository(repo.path)

  await expect(sillygit.graph.row('Octopus merge')).toBeVisible()
  for (const subject of ['Add alpha', 'Add beta', 'Add gamma', 'Merge delta']) {
    await expect(sillygit.graph.row(subject)).toBeVisible()
  }
  // One merge line per extra parent, besides the line to the first parent.
  await expect(sillygit.graph.row('Octopus merge').locator('[data-testid="merge-line"]')).toHaveCount(3)
})

test('a conflicting octopus merge names every branch and commits with all of them as parents', async ({
  sillygit,
  repo
}) => {
  scenario.octopusConflict(repo)
  // The app merges one branch at a time; start the octopus from the command line.
  expect(() => repo.git('merge', '--no-edit', 'alpha', 'beta', 'gamma')).toThrow()
  await sillygit.openRepository(repo.path)

  await sillygit.conflicts.expectConflicts('Merge conflicts detected', 'Merging alpha, beta and gamma into main', [
    'hello.txt'
  ])
  await sillygit.conflicts.openFile('hello.txt')
  await expect(sillygit.mergeTool.current).toContainText('beta')
  await expect(sillygit.mergeTool.incoming).toContainText('gamma')
  await sillygit.mergeTool.takeAll('A')
  await sillygit.mergeTool.takeAll('B')
  await sillygit.mergeTool.saveWithShortcut()
  await sillygit.conflicts.expectNoConflictedFiles()

  await expect(sillygit.page.getByPlaceholder('Commit message')).toHaveValue("Merge branches 'alpha', 'beta' and 'gamma'")
  await sillygit.conflicts.button('Commit and Merge').click()
  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.git('rev-list', '--parents', '-1', 'HEAD').trim().split(' ')).toHaveLength(4)
  expect(repo.readFile('hello.txt')).toBe('hello\nbeta\ngamma\n')
})

test('a criss-cross merge resolves against the virtual merge base', async ({ sillygit, repo }) => {
  scenario.crissCross(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['story.txt'])

  await sillygit.conflicts.openFile('story.txt')
  await expect(sillygit.mergeTool.position).toHaveText('conflict 1 of 1')
  await sillygit.mergeTool.takeHunk('B', 1)
  await sillygit.mergeTool.saveWithShortcut()
  await sillygit.conflicts.button('Commit and Merge').click()
  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.readFile('story.txt')).toBe(numbered(6).replace('line 2\n', 'line 2 (feature B)\n'))
})

test('rename/modify: the conflict appears at the new name and the rename is kept', async ({ sillygit, repo }) => {
  scenario.renameModify(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['salutation.txt'])

  await sillygit.conflicts.openFile('salutation.txt')
  await expect(sillygit.mergeTool.current).toContainText('line 3 (main)')
  await expect(sillygit.mergeTool.incoming).toContainText('line 3 (feature)')
  await sillygit.mergeTool.takeHunk('A', 1)
  await sillygit.mergeTool.takeHunk('B', 1)
  await sillygit.mergeTool.saveWithShortcut()

  await sillygit.conflicts.expectNoConflictedFiles()
  // The staged rename is listed under its new name, not "R100 salutation.txt".
  await expect(sillygit.page.getByRole('complementary', { name: 'Details' }).locator('.file-path')).toContainText([
    'salutation.txt'
  ])
  await sillygit.conflicts.button('Commit and Merge').click()
  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.git('ls-tree', '--name-only', 'HEAD').split('\n')).not.toContain('greeting.txt')
  expect(repo.readFile('salutation.txt')).toBe(numbered(10).replace('line 3\n', 'line 3 (main)\nline 3 (feature)\n'))
})

test('rename/rename: the rename dialog keeps one name for all three paths', async ({ sillygit, repo }) => {
  scenario.renameRename(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['ours.txt', 'shared.txt', 'theirs.txt'])
  await expect(sillygit.page.getByText('Resolve all 3 conflicted files to continue.')).toBeVisible()

  await sillygit.conflicts.openFile('theirs.txt')
  const dialog = sillygit.page.getByRole('alertdialog', { name: 'Rename conflict' })
  await expect(dialog).toContainText('Both sides renamed shared.txt: main to ours.txt, feature to theirs.txt.')
  await expect(dialog.getByRole('button', { name: 'Keep Both' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep As ours.txt' }).click()

  await sillygit.conflicts.expectNoConflictedFiles()
  await sillygit.conflicts.button('Commit and Merge').click()
  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.git('ls-tree', '--name-only', 'HEAD').trim().split('\n')).toEqual(['README.md', 'hello.txt', 'ours.txt'])
})

test('rename/rename with edits: the kept name becomes an ordinary conflict', async ({ sillygit, repo }) => {
  scenario.renameRenameEdited(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['ours.txt', 'shared.txt', 'theirs.txt'])

  await sillygit.conflicts.openFile('ours.txt')
  await sillygit.page
    .getByRole('alertdialog', { name: 'Rename conflict' })
    .getByRole('button', { name: 'Keep As theirs.txt' })
    .click()
  await expect(sillygit.conflicts.conflictedFiles.locator('.file-path')).toHaveText(['theirs.txt'])

  await sillygit.conflicts.openFile('theirs.txt')
  await expect(sillygit.mergeTool.position).toHaveText('conflict 1 of 1')
  await sillygit.mergeTool.takeAll('B')
  await sillygit.mergeTool.saveWithShortcut()
  await sillygit.conflicts.expectNoConflictedFiles()
  expect(repo.readFile('theirs.txt')).toBe(
    numbered(20)
      .replace('line 3\n', 'line 3 (feature)\n')
      .replace('line 7\n', 'line 7 (feature)\n')
      .replace('line 19\n', 'line 19 (main)\n')
  )
})

test('rename/delete: the dialog says which side renamed and which deleted', async ({ sillygit, repo }) => {
  scenario.renameDelete(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['kept.txt'])

  await sillygit.conflicts.openFile('kept.txt')
  const dialog = sillygit.page.getByRole('alertdialog', { name: 'Rename conflict' })
  await expect(dialog).toContainText('main renamed shared.txt to kept.txt, but feature deleted it.')
  await expect(dialog.getByRole('button', { name: 'Keep Both' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Keep As kept.txt' }).click()

  await sillygit.conflicts.expectNoConflictedFiles()
  expect(repo.readFile('kept.txt')).toBe(numbered(10))
})

test('a file where the other side added a folder explains where git put it', async ({ sillygit, repo }) => {
  scenario.directoryFile(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['thing~HEAD'])

  await sillygit.conflicts.openFile('thing~HEAD')
  const dialog = sillygit.page.getByRole('alertdialog', { name: 'File and folder conflict' })
  await expect(dialog).toContainText(
    'main added a file thing, but feature added a folder with the same name. Git kept the folder and saved the file as thing~HEAD.'
  )
  await dialog.getByRole('button', { name: 'Keep As thing~HEAD' }).click()

  await sillygit.conflicts.expectNoConflictedFiles()
  await sillygit.conflicts.button('Commit and Merge').click()
  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.git('ls-tree', '-r', '--name-only', 'HEAD').split('\n')).toEqual(
    expect.arrayContaining(['thing/inner.txt', 'thing~HEAD'])
  )
})

test('taking a whole side from the file menu keeps the other side\'s changes that did not conflict', async ({
  sillygit,
  repo
}) => {
  scenario.partialConflict(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['part.txt'])

  await sillygit.conflicts.fileMenu('part.txt', 'Take incoming (feature)')
  await sillygit.conflicts.expectNoConflictedFiles()
  expect(repo.readFile('part.txt')).toBe(
    numbered(10).replace('line 2\n', 'line 2 (feature)\n').replace('line 8\n', 'line 8 (main)\n')
  )
})

test('a file with a non-ASCII name is listed and resolved by its real name', async ({ sillygit, repo }) => {
  scenario.unicodeConflict(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, [scenario.UNICODE_PATH])

  await sillygit.conflicts.openFile(scenario.UNICODE_PATH)
  await expect(sillygit.mergeTool.current).toContainText('中文 · Ελληνικά · 🇳🇿')
  await expect(sillygit.mergeTool.incoming).toContainText('שלום עולם')
  await sillygit.mergeTool.takeAll('B')
  await sillygit.mergeTool.saveWithShortcut()

  await sillygit.conflicts.expectNoConflictedFiles()
  expect(repo.readFile(scenario.UNICODE_PATH)).toBe('Grüße\nשלום עולם · 👩‍💻 · é\n🙂 end\n')
})

test('lines that look like conflict markers are shown as content', async ({ sillygit, repo }) => {
  scenario.markerLookalikes(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['doc.rst'])

  await sillygit.conflicts.openFile('doc.rst')
  await expect(sillygit.mergeTool.position).toHaveText('conflict 1 of 1')
  await sillygit.mergeTool.takeAll('A')
  await sillygit.mergeTool.expectOutput(['Intro', '', 'Title (main)', '=======', '>>>>>>> quoted', '<<<<<<<', '', 'Body'])
  await sillygit.mergeTool.saveWithShortcut()

  await sillygit.conflicts.expectNoConflictedFiles()
  expect(repo.readFile('doc.rst')).toBe(repo.git('show', 'main:doc.rst'))
})

test('a binary conflict offers whole-file choices only', async ({ sillygit, repo }) => {
  scenario.binaryConflict(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['logo.png'])

  await sillygit.conflicts.openFile('logo.png')
  const prompt = sillygit.page.getByRole('alertdialog', { name: 'Binary file conflict' })
  await prompt.getByRole('button', { name: 'Take incoming (feature)' }).click()

  await sillygit.conflicts.expectNoConflictedFiles()
  // Resolved in the index too (stage 0), once the app has staged it.
  await expect
    .poll(() => repo.git('ls-files', '--stage', 'logo.png').split(/\s+/).slice(1, 3))
    .toEqual([repo.git('rev-parse', 'feature:logo.png').trim(), '0'])
})

test('CRLF files keep CRLF when lines from both sides are taken', async ({ sillygit, repo }) => {
  scenario.crlfBothSides(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['dos.txt'])

  await sillygit.conflicts.openFile('dos.txt')
  await sillygit.mergeTool.takeHunk('A', 1)
  await sillygit.mergeTool.takeHunk('B', 1)
  await sillygit.mergeTool.saveWithShortcut()

  await sillygit.conflicts.expectNoConflictedFiles()
  expect(repo.readFile('dos.txt')).toBe(numbered(5, '\r\n').replace('line 3\r\n', 'line 3 (main)\r\nline 3 (feature)\r\n'))
})

test('a 5000-line hunk opens and resolves', async ({ sillygit, repo }) => {
  scenario.largeHunk(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['big.txt'])

  await sillygit.conflicts.openFile('big.txt')
  await expect(sillygit.mergeTool.position).toHaveText('conflict 1 of 1')
  await sillygit.mergeTool.takeAll('B')
  await sillygit.mergeTool.saveWithShortcut()
  await sillygit.mergeTool.expectClosed()
  expect(repo.readFile('big.txt')).toBe(repo.git('show', 'feature:big.txt'))
})

test('hundreds of hunks: steps through them and takes a whole side', async ({ sillygit, repo }) => {
  scenario.manyHunks(repo, 600, 3)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['many.txt'])

  await sillygit.conflicts.openFile('many.txt')
  await expect(sillygit.mergeTool.position).toHaveText('conflict 1 of 200')
  await sillygit.mergeTool.takeAll('A')
  await sillygit.mergeTool.takeHunk('B', 200)
  await sillygit.mergeTool.saveWithShortcut()
  await sillygit.mergeTool.expectClosed()

  const lines = repo.readFile('many.txt').split('\n')
  expect(lines[0]).toBe('line 1 (main)')
  expect(lines.slice(597, 599)).toEqual(['line 598 (main)', 'line 598 (feature)'])
})

test('one merge with many kinds of conflicted file at once', async ({ sillygit, repo }) => {
  scenario.kitchenSink(repo)
  await sillygit.openRepository(repo.path)
  await mergeFeature(sillygit, ['added.txt', 'crlf.txt', 'doomed.txt', 'edit.txt', 'moved-feature.txt'])
  await expect(sillygit.page.getByText('Resolve all 5 conflicted files to continue.')).toBeVisible()

  for (const path of ['added.txt', 'crlf.txt', 'edit.txt', 'moved-feature.txt']) {
    await sillygit.conflicts.fileMenu(path, 'Take incoming (feature)')
  }
  await sillygit.conflicts.openFile('doomed.txt')
  await sillygit.page.getByRole('alertdialog', { name: 'Modify/delete conflict' }).getByRole('button', { name: 'Keep Modified Version' }).click()

  await sillygit.conflicts.expectNoConflictedFiles()
  await sillygit.conflicts.button('Commit and Merge').click()
  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.readFile('doomed.txt')).toBe('doomed, but edited\n')
  expect(repo.readFile('crlf.txt')).toBe(numbered(3, '\r\n').replace('line 2', 'line 2 (feature)'))
})

test('a rebase that stops on two commits walks through both', async ({ sillygit, repo }) => {
  scenario.rebaseStack(repo)
  await sillygit.openRepository(repo.path)

  await sillygit.sidebar.branchMenu('main', 'Rebase topic onto main')
  await sillygit.conflicts.expectConflicts('Rebase conflicts detected', 'Rebasing topic onto main (commit 1 of 3)', [
    'list.txt'
  ])
  // Pick in the merge tool: taking the whole incoming file would also drop
  // main's change to line 8, and then the third commit would apply cleanly.
  await sillygit.conflicts.openFile('list.txt')
  await sillygit.mergeTool.takeAll('B')
  await sillygit.mergeTool.saveWithShortcut()
  await sillygit.conflicts.button('Continue Rebase').click()

  await sillygit.conflicts.expectConflicts('Rebase conflicts detected', 'Rebasing topic onto main (commit 3 of 3)', [
    'list.txt'
  ])
  await sillygit.conflicts.openFile('list.txt')
  await sillygit.mergeTool.takeAll('B')
  await sillygit.mergeTool.saveWithShortcut()
  await sillygit.conflicts.button('Continue Rebase').click()

  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.git('log', '--format=%s', '-4').trim().split('\n')).toEqual(['Topic 3', 'Topic 2', 'Topic 1', 'Main edits list'])
})

test('a revert that conflicts is labelled as a revert', async ({ sillygit, repo }) => {
  scenario.revertConflict(repo)
  await sillygit.openRepository(repo.path)

  await sillygit.graph.row('Line 2 v2').click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: /^Revert commit/ }).click()
  await sillygit.conflicts.expectConflicts('Revert conflicts detected', /Reverting [0-9a-f]{7} Line 2 v2/, ['rev.txt'])

  await sillygit.conflicts.fileMenu('rev.txt', /^Take incoming \(revert of/)
  await sillygit.conflicts.button('Commit Revert').click()
  await expect(sillygit.conflicts.header).toHaveCount(0)
  expect(repo.readFile('rev.txt')).toBe(numbered(4))
})
