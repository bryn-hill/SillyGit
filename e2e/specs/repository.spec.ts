import { expect, test } from '../fixtures'
import { FixtureRepo } from '../support/fixtureRepo'

test('starts with no repository open', async ({ sillygit }) => {
  await expect(sillygit.emptyState).toBeVisible()
  await expect(sillygit.openRepositoryButton).toBeVisible()
})

test('opening a repository shows its branch and history', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)

  await expect(sillygit.repositoryCrumb).toContainText(repo.name)
  await expect(sillygit.branchCrumb).toContainText('main')
  await sillygit.graph.expectSubjects(FixtureRepo.commits)
})

test('uncommitted changes appear as a WIP row', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nthere\n')
  await sillygit.openRepository(repo.path)

  await expect(sillygit.graph.workingChangesRow()).toHaveAttribute('aria-selected', 'true')
  await expect(sillygit.details.file('hello.txt')).toBeVisible()
})
