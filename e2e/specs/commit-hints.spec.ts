import { expect, test } from '../fixtures'

test.describe('commit templates, recent messages and type(scope)', () => {
  test.beforeEach(async ({ repo }) => {
    // Recent lists the user's own commits, so match the fixture's author.
    repo.git('config', 'user.email', 'e2e@example.com')
  })

  test('starts the box from commit.template and only commits once it is filled in', async ({ sillygit, repo }) => {
    repo.writeFile('.gitmessage', '# Say why\nfeat: \n\nTicket: \n')
    repo.git('config', 'commit.template', '.gitmessage')
    repo.writeFile('new.txt', 'new\n')
    repo.git('add', 'new.txt')
    await sillygit.openRepository(repo.path)
    const { details, page } = sillygit

    await expect(details.commitMessage).toHaveValue('feat:\n\nTicket:')
    const commit = page.getByRole('button', { name: 'Commit (1)' })
    await expect(commit).toBeDisabled()

    await details.commitMessage.fill('feat: add new\n\nTicket: ABC-1')
    await commit.click()
    await expect(sillygit.graph.rows.filter({ hasText: 'feat: add new' })).toHaveCount(1)
    // After committing the box starts from the template again.
    await expect(details.commitMessage).toHaveValue('feat:\n\nTicket:')
  })

  test('reuses a recent message and picks a type with a scope from history', async ({ sillygit, repo }) => {
    repo.commitFile('ui.txt', 'a\n', 'fix(ui): align the toolbar\n\nIt was off by one.')
    repo.commitFile('git.txt', 'b\n', 'feat(git): fetch tags')
    repo.writeFile('wip.txt', 'wip\n')
    repo.git('add', 'wip.txt')
    await sillygit.openRepository(repo.path)
    const { details, page } = sillygit

    await details.openCommitMenu('Recent')
    await page.getByRole('menuitem', { name: 'fix(ui): align the toolbar' }).click()
    await expect(details.commitMessage).toHaveValue('fix(ui): align the toolbar\n\nIt was off by one.')

    await details.openCommitMenu('Type')
    await page.getByRole('menu').getByText('feat', { exact: true }).hover()
    await page.getByRole('menuitem', { name: 'feat(git):' }).click()
    await expect(details.commitMessage).toHaveValue('feat(git): align the toolbar\n\nIt was off by one.')
  })
})
