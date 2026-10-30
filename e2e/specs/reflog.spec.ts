import { expect, test } from '../fixtures'
import { Reflog } from '../pages/Reflog'

test.describe('reflog', () => {
  test('brings back a commit that a reset threw away', async ({ sillygit, repo }) => {
    repo.commitFile('b.txt', 'b\n', 'Add b')
    repo.git('reset', '-q', '--hard', 'HEAD~1')
    await sillygit.openRepository(repo.path)
    await expect(sillygit.graph.row('Add b')).toHaveCount(0)

    await sillygit.actionsButton.click()
    await sillygit.actions.getByRole('textbox').fill('reflog')
    await sillygit.page.keyboard.press('Enter')

    const reflog = new Reflog(sillygit.page)
    await expect(reflog.tab).toHaveAttribute('aria-selected', 'true')
    await expect(reflog.entries.first()).toContainText('reset')
    await expect(reflog.entry('HEAD@{1}')).toContainText('Add b')

    // Nothing reaches the commit, so the graph can't show it.
    await reflog.act('HEAD@{1}', 'Show in graph')
    await expect(reflog.entry('HEAD@{1}')).toContainText('No branch or tag reaches this commit')

    await reflog.act('HEAD@{1}', 'Create branch here…')
    await sillygit.page.getByLabel('Branch name').fill('rescued')
    await sillygit.page.keyboard.press('Enter')
    await expect(sillygit.graph.badge('rescued')).toBeVisible()

    // The new branch is checked out, so the newest entry is that checkout, onto Add b.
    await expect(reflog.entries.first()).toContainText('moving from main to rescued')
    await reflog.act('HEAD@{0}', 'Show in graph')
    await expect(reflog.dialog).toHaveCount(0)
    await sillygit.graph.expectSelected('Add b')
  })

  test('lists a branch reflog', async ({ sillygit, repo }) => {
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)
    await sillygit.actionsButton.click()
    await sillygit.actions.getByRole('textbox').fill('reflog')
    await sillygit.page.keyboard.press('Enter')

    const reflog = new Reflog(sillygit.page)
    await reflog.showRef('feature')
    await expect(reflog.entry('feature@{0}')).toBeVisible()
    await expect(reflog.entries.last()).toContainText('branch')
  })
})
