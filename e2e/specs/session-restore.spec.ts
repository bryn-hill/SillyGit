import { expect, test } from '../fixtures'
import { FixtureRepo } from '../support/fixtureRepo'

test('reopens the last repository and panel layout after a relaunch', async ({ sillygit, repo, relaunch }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.toggleTerminal()
  await expect(sillygit.terminal.root).toBeVisible()
  // Layout saves are debounced.
  await sillygit.page.waitForTimeout(600)

  const reopened = await relaunch()

  await expect(reopened.repositoryCrumb).toContainText(repo.name)
  await reopened.graph.expectSubjects(FixtureRepo.commits)
  await expect(reopened.terminal.root).toBeVisible()
})

test('switches between recent repositories from the repository menu', async ({ sillygit, repo, relaunch }) => {
  const other = new FixtureRepo()
  try {
    await sillygit.openRepository(other.path)
    await sillygit.openRepositoryFromMenu(repo.path)

    await sillygit.repositoryCrumb.click()
    await sillygit.page.getByRole('menuitem', { name: other.name }).click()
    await expect(sillygit.repositoryCrumb).toContainText(other.name)

    const reopened = await relaunch()
    await expect(reopened.repositoryCrumb).toContainText(other.name)
  } finally {
    other.remove()
  }
})

test('shows a notice when the last repository no longer exists', async ({ sillygit, repo, relaunch }) => {
  const doomed = new FixtureRepo()
  await sillygit.openRepository(repo.path)
  await sillygit.openRepositoryFromMenu(doomed.path)
  doomed.remove()

  const reopened = await relaunch()

  await expect(reopened.notice).toContainText(`Couldn't reopen ${doomed.path}`)
  await expect(reopened.emptyState).toBeVisible()
  const recent = reopened.page.getByRole('region', { name: 'Recent repositories' })
  await expect(recent.getByRole('button', { name: new RegExp(repo.name) })).toBeVisible()
  await expect(recent.getByRole('button', { name: new RegExp(doomed.name) })).toHaveCount(0)

  await recent.getByRole('button', { name: new RegExp(repo.name) }).click()
  await reopened.graph.expectSubjects(FixtureRepo.commits)
})
