import { basename, join } from 'path'
import { expect, test } from '../fixtures'

test.describe('tags, worktrees and submodules in the side bar', () => {
  test('lists tags; clicking one selects its commit and its menu deletes it', async ({ sillygit, repo }) => {
    repo.git('tag', '-a', 'v1.0', '-m', 'First release', 'HEAD~1')
    repo.commitFile('later.txt', 'later\n', 'Later work')
    await sillygit.openRepository(repo.path)

    const tags = sillygit.page.getByRole('list', { name: 'Tags' })
    await expect(tags).toContainText('v1.0')
    await tags.getByRole('button', { name: /v1\.0/ }).click()
    await sillygit.graph.expectSelected('Initial commit')

    sillygit.page.on('dialog', (dialog) => dialog.accept())
    await tags.getByRole('button', { name: /v1\.0/ }).click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Delete v1.0', exact: true }).click()
    await expect(tags).toContainText('No tags')
    expect(repo.git('tag')).toBe('')
  })

  test('lists linked worktrees and removes one', async ({ sillygit, repo }) => {
    const linked = join(repo.path, '..', `${basename(repo.path)}-feature`)
    repo.git('worktree', 'add', '-q', '-b', 'feature', linked)
    await sillygit.openRepository(repo.path)

    const worktrees = sillygit.page.getByRole('list', { name: 'Worktrees' })
    await expect(worktrees.getByRole('button')).toHaveCount(2)
    await expect(worktrees).toContainText('main')
    await expect(worktrees).toContainText('feature')

    sillygit.page.on('dialog', (dialog) => dialog.accept())
    await worktrees.getByRole('button', { name: /feature/ }).click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Remove worktree…' }).click()
    await expect(worktrees).toHaveCount(0)
    expect(repo.git('worktree', 'list')).not.toContain('feature')
  })

  test('hides worktrees and submodules when there are none', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await expect(sillygit.page.getByRole('list', { name: 'Tags' })).toContainText('No tags')
    await expect(sillygit.page.getByRole('list', { name: 'Worktrees' })).toHaveCount(0)
    await expect(sillygit.page.getByRole('list', { name: 'Submodules' })).toHaveCount(0)
  })
})
