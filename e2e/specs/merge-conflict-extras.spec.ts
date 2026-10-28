import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '../fixtures'
import { multiFileConflict, numbered } from '../support/mergeScenarios'
import { stubIpc } from '../support/ipc'

// Conflict extras: bulk actions on several conflicted files (with Undo), AI
// auto-resolve previewed per conflict, and an external merge tool.

const MERGED = (who: 'main' | 'feature'): string =>
  numbered(5)
    .replace('line 1\n', 'line 1 (main)\n')
    .replace('line 3\n', `line 3 (${who})\n`)
    .replace('line 5\n', 'line 5 (feature)\n')

test.describe('several conflicted files', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    multiFileConflict(repo)
    await sillygit.openRepository(repo.path)
    await sillygit.sidebar.branchMenu('feature', 'Merge feature into main')
    await sillygit.conflicts.expectConflicts('Merge conflicts detected', 'Merging feature into main', ['a.txt', 'b.txt', 'c.txt'])
  })

  test('takes incoming for a selection of files, then undoes it', async ({ sillygit, repo }) => {
    const { conflicts } = sillygit
    const conflictedBefore = repo.readFile('a.txt')
    await conflicts.toggleSelect('a.txt')
    await conflicts.toggleSelect('b.txt')
    await expect(conflicts.button('Mark 2 resolved')).toBeVisible()

    await conflicts.fileMenu('b.txt', 'Take incoming (feature) 2 files')
    await expect(conflicts.conflictedFiles.locator('.file-path')).toHaveText(['c.txt'])
    // Main's change that didn't conflict is kept.
    expect(repo.readFile('a.txt')).toBe(MERGED('feature'))
    expect(repo.readFile('b.txt')).toBe(MERGED('feature'))

    await expect(conflicts.undoBanner).toContainText('Took incoming (feature) for 2 files.')
    await conflicts.undoBanner.getByRole('button', { name: 'Undo' }).click()
    await expect(conflicts.conflictedFiles.locator('.file-path')).toHaveText(['a.txt', 'b.txt', 'c.txt'])
    expect(repo.readFile('a.txt')).toBe(conflictedBefore)
  })

  test('warns before marking files with conflict markers resolved', async ({ sillygit }) => {
    const page = sillygit.page
    let message = ''
    page.once('dialog', (dialog) => {
      message = dialog.message()
      void dialog.dismiss()
    })
    await sillygit.conflicts.markAllResolvedButton.click()
    await expect.poll(() => message).toContain('3 files still have conflict markers')
    await expect(sillygit.conflicts.conflictedFiles.locator('.file-path')).toHaveText(['a.txt', 'b.txt', 'c.txt'])

    page.once('dialog', (dialog) => void dialog.accept())
    await sillygit.conflicts.markAllResolvedButton.click()
    await sillygit.conflicts.expectNoConflictedFiles()
  })

  test('opens a file in the external merge tool set in Settings', async ({ sillygit, repo }) => {
    // A stand-in merge tool that resolves to the incoming side.
    const tool = join(repo.path, '.git', 'fake-merge-tool')
    writeFileSync(tool, '#!/bin/sh\ncat "$1" > "$2"\n')
    chmodSync(tool, 0o755)

    await sillygit.settings.open()
    await sillygit.settings.mergeTool.selectOption({ label: 'Custom command' })
    await sillygit.settings.mergeToolCommand.fill(`${tool} $REMOTE $MERGED`)
    await sillygit.settings.mergeToolCommand.blur()
    await sillygit.settings.close()

    await sillygit.conflicts.fileMenu('c.txt', 'Open in fake-merge-tool')
    await expect(sillygit.conflicts.conflictedFiles.locator('.file-path')).toHaveText(['a.txt', 'b.txt'])
    await expect(sillygit.page.getByRole('status').filter({ hasText: 'Resolved c.txt in fake-merge-tool' })).toBeVisible()
    expect(repo.readFile('c.txt')).toBe(numbered(5).replace('line 3\n', 'line 3 (feature)\n').replace('line 5\n', 'line 5 (feature)\n'))
  })
})

test('AI auto-resolve suggests each conflict for the user to accept or reject', async ({ sillygit, electronApp, repo }) => {
  repo.addConflictingBranch()
  await stubIpc(electronApp, 'ai:resolve-conflicts', {
    ok: true,
    data: {
      hunkCount: 2,
      summary: 'Kept both edits where possible.',
      resolutions: [
        { hunkId: 0, lines: ['two (main + feature)\n'], confidence: 'high', explanation: 'Both sides reworded line two.' },
        { hunkId: 1, lines: ['eight (AI)\n'], confidence: 'low', explanation: 'A guess.' }
      ]
    }
  })
  await sillygit.openRepository(repo.path)
  await sillygit.sidebar.branchMenu('feature', 'Merge feature into main')
  await sillygit.conflicts.openFile('notes.txt')

  const tool = sillygit.mergeTool
  await tool.autoResolveButton.click()
  await expect(tool.root.getByRole('status', { name: 'AI merge summary' })).toContainText('Kept both edits where possible.')
  await expect(tool.suggestion(1)).toContainText('high confidence')
  await expect(tool.suggestion(2)).toContainText('A guess.')
  // Suggestions are a preview: the conflicts are still unresolved until accepted.
  await expect(tool.output).toContainText('2 unresolved')

  await tool.suggestion(1).getByRole('button', { name: 'Accept' }).click()
  await tool.suggestion(2).getByRole('button', { name: 'Reject' }).click()
  await expect(tool.output).toContainText('1 unresolved')
  await tool.takeHunk('A', 2)
  await tool.expectOutput(['one', 'two (main + feature)', 'three', 'four', 'five', 'six', 'seven', 'eight (main)', 'nine', 'ten'])

  await tool.saveWithShortcut()
  await tool.expectClosed()
  await sillygit.conflicts.expectNoConflictedFiles()
  expect(repo.readFile('notes.txt')).toBe(
    ['one', 'two (main + feature)', 'three', 'four', 'five', 'six', 'seven', 'eight (main)', 'nine', 'ten'].join('\n') + '\n'
  )
})
