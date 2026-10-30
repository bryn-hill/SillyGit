import { expect, test } from '../fixtures'

test.describe('early conflict warnings', () => {
  test('tags a branch that would conflict and lists the files on hover', async ({ sillygit, repo }) => {
    repo.addConflictingBranch()
    repo.git('checkout', '-q', '-b', 'clean', 'main~1')
    repo.commitFile('other.txt', 'other\n', 'Unrelated work')
    repo.git('checkout', '-q', 'main')
    await sillygit.openRepository(repo.path)
    const { sidebar, settings } = sillygit

    await expect(sidebar.conflictTag('feature')).toHaveText('conflicts')
    await expect(sidebar.conflictTag('clean')).toHaveCount(0)
    await expect(sidebar.conflictTag('main')).toHaveCount(0)

    await sidebar.conflictTag('feature').hover()
    await expect(sidebar.conflictCard).toContainText('Would conflict with main')
    await expect(sidebar.conflictCard).toContainText('notes.txt')
    await sidebar.branchNamed('main').hover()
    await expect(sidebar.conflictCard).toHaveCount(0)

    // Resolving the clash on the branch clears the tag once the list refreshes.
    repo.git('checkout', '-q', 'feature')
    repo.git('merge', '-q', '-X', 'theirs', 'main', '-m', 'Take main')
    repo.git('checkout', '-q', 'main')
    await expect(sidebar.conflictTag('feature')).toHaveCount(0)

    repo.git('checkout', '-q', '-b', 'again', 'main~1')
    repo.commitFile('notes.txt', 'rewritten\n', 'Rewrite notes')
    repo.git('checkout', '-q', 'main')
    await expect(sidebar.conflictTag('again')).toHaveText('conflicts')

    await settings.open()
    await expect(settings.conflictWarnings).toBeChecked()
    await settings.conflictWarnings.uncheck()
    await settings.close()
    await expect(sidebar.conflictTag('again')).toHaveCount(0)
  })
})
