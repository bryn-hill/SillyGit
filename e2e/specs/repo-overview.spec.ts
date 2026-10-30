import { expect, test } from '../fixtures'
import { FixtureRepo } from '../support/fixtureRepo'
import { RepoOverview } from '../pages/RepoOverview'

test('lists repos with branch, ahead/behind and changes, in groups, and fetches them all', async ({
  sillygit,
  repo,
  electronApp
}) => {
  const other = new FixtureRepo()
  try {
    // `other` tracks a real origin: one commit to push, and one on origin it hasn't fetched yet.
    other.addPullRequestRemote(1, 'feature')
    other.commitFile('remote.txt', 'remote\n', 'Add remote.txt')
    other.git('push', '-q', 'origin', 'main')
    other.git('reset', '-q', '--hard', 'HEAD~1')
    other.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    other.commitFile('local.txt', 'local\n', 'Add local.txt')
    repo.writeFile('hello.txt', 'changed\n')
    repo.writeFile('new.txt', 'new\n')

    await sillygit.openRepository(repo.path)
    const overview = new RepoOverview(sillygit.page)
    await overview.tab.click()
    await expect(overview.tab).toHaveAttribute('aria-selected', 'true')

    await electronApp.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [path] })) as never
    }, other.path)
    await overview.root.getByRole('button', { name: '+ Add repo' }).click()

    await expect(overview.rows).toHaveCount(2)
    await expect(overview.row(repo.name)).toContainText('2 changes')
    await expect(overview.row(repo.name)).toContainText('open')
    await expect(overview.row(other.name)).toContainText('main')
    await expect(overview.row(other.name)).toContainText('↑1')
    await expect(overview.row(other.name)).not.toContainText('↓')
    await expect(overview.row(other.name)).toContainText('clean')

    await overview.root.getByRole('button', { name: 'Fetch all' }).click()
    await expect(overview.row(other.name)).toContainText('↓1')

    await overview.newGroup('Work')
    await overview.moveToGroup(other.name, 'Work')
    await expect(overview.group('Work').getByTestId('repo-overview-row')).toHaveCount(1)
    await expect(overview.group('Not in a group').getByTestId('repo-overview-row')).toHaveCount(1)

    // Clicking a repo opens it in a tab.
    await overview.row(other.name).getByText(other.name, { exact: true }).click()
    await expect(overview.root).toHaveCount(0)
    await sillygit.tabs.expectActive(other.name)

    // The groups are saved.
    await overview.tab.click()
    await expect(overview.group('Work')).toContainText(other.name)
  } finally {
    other.remove()
  }
})
