import { expect, test } from '../fixtures'
import { FixtureRepo } from '../support/fixtureRepo'

test.describe('Branch / Tag column', () => {
  test('a local branch and its remote share one pill', async ({ sillygit, repo }) => {
    const upstream = new FixtureRepo()
    try {
      repo.addFeatureBranch()
      repo.git('remote', 'add', 'origin', upstream.path)
      repo.git('push', '-q', '-u', 'origin', 'feature')
      await sillygit.openRepository(repo.path)

      const pill = sillygit.graph.badge('feature')
      await expect(pill).toHaveText('feature')
      // The remote is the cloud icon inside the same pill.
      await expect(pill.locator('[data-ref="origin/feature"]')).toBeVisible()

      await sillygit.graph.badge('origin/feature').click({ button: 'right' })
      await expect(sillygit.page.getByRole('menuitem', { name: 'Create worktree from origin/feature…' })).toBeVisible()
    } finally {
      upstream.remove()
    }
  })

  test('the checked-out branch comes first and the rest are behind "+N"', async ({ sillygit, repo }) => {
    repo.git('branch', 'one')
    repo.git('tag', 'v1.0')
    await sillygit.openRepository(repo.path)

    const row = sillygit.graph.row('Add hello.txt')
    await expect(row.locator('[data-ref]').first()).toHaveAttribute('data-ref', 'main')
    await expect(row.getByLabel('Checked out')).toBeVisible()
    await expect(sillygit.graph.badge('v1.0')).toBeHidden()

    await sillygit.graph.moreRefs('Add hello.txt').hover()
    await expect(sillygit.graph.badge('one')).toBeVisible()
    await expect(sillygit.graph.badge('v1.0')).toBeVisible()

    await sillygit.graph.badge('one').dblclick()
    await expect(sillygit.branchCrumb).toContainText('one')
  })

  test('the column can be resized and keeps its width after a relaunch', async ({ sillygit, repo, relaunch }) => {
    await sillygit.openRepository(repo.path)
    const cell = sillygit.graph.row('Add hello.txt').getByTestId('ref-cell')
    const before = (await cell.boundingBox())!.width

    const handle = (await sillygit.graph.refColumnResizer.boundingBox())!
    const y = handle.y + handle.height / 2
    await sillygit.page.mouse.move(handle.x + handle.width / 2, y)
    await sillygit.page.mouse.down()
    await sillygit.page.mouse.move(handle.x + handle.width / 2 + 80, y, { steps: 4 })
    await sillygit.page.mouse.up()

    await expect.poll(async () => (await cell.boundingBox())!.width).toBeCloseTo(before + 80, 0)
    // Layout saves are debounced.
    await sillygit.page.waitForTimeout(600)

    const reopened = await relaunch()
    const reopenedCell = reopened.graph.row('Add hello.txt').getByTestId('ref-cell')
    await expect.poll(async () => (await reopenedCell.boundingBox())?.width).toBeCloseTo(before + 80, 0)
  })
})
