import { expect, test } from '../fixtures'

test.describe('selecting several commits', () => {
  test.beforeEach(async ({ repo }) => {
    repo.commitFile('a.txt', 'a\n', 'Add a')
    repo.commitFile('b.txt', 'b\n', 'Add b')
    repo.commitFile('c.txt', 'c\n', 'Add c')
  })

  test('Cmd/Ctrl-click adds commits to the selection', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await sillygit.graph.select('Add b')
    await sillygit.graph.row('Add hello.txt').click({ modifiers: ['ControlOrMeta'] })

    await expect(sillygit.graph.selectedRow).toHaveCount(2)
    await expect(sillygit.details.root).toContainText('2 commits selected')

    // Cmd/Ctrl-click again removes it.
    await sillygit.graph.row('Add b').click({ modifiers: ['ControlOrMeta'] })
    await sillygit.details.expectCommit('Add hello.txt')
  })

  test('Shift-click selects a range, and its commits can be cherry-picked together', async ({ sillygit, repo }) => {
    repo.git('checkout', '-q', '-b', 'other', 'HEAD~3')
    await sillygit.openRepository(repo.path)
    // "Add c", the newest commit, starts selected.
    await sillygit.graph.expectSelected('Add c')
    await sillygit.graph.row('Add a').click({ modifiers: ['Shift'] })

    await expect(sillygit.graph.selectedRow).toHaveCount(3)
    await sillygit.details.root.getByRole('button', { name: 'Cherry-pick 3 commits' }).click()

    await expect.poll(() => repo.git('log', '--format=%s', '-4', 'other').trim().split('\n')).toEqual([
      'Add c',
      'Add b',
      'Add a',
      'Add hello.txt'
    ])
  })
})

test.describe('checking out branches', () => {
  test.beforeEach(async ({ repo }) => {
    repo.addFeatureBranch()
  })

  test('a single click on a branch label selects its commit; a double-click checks it out', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    // Both branch tips are made in the same second, so either may be the
    // first row and already selected; start from another commit.
    await sillygit.graph.select('Initial commit')

    await sillygit.graph.badge('feature').click()
    await sillygit.details.expectCommit('Add feature.txt on feature')
    await expect(sillygit.branchCrumb).toContainText('main')

    await sillygit.graph.badge('feature').dblclick()
    await expect(sillygit.branchCrumb).toContainText('feature')
    await sillygit.graph.expectSelected('Add feature.txt on feature')
  })

  test('the side bar selects on click and checks out on double-click', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.sidebar.branch('feature').click()
    await sillygit.details.expectCommit('Add feature.txt on feature')
    await expect(sillygit.branchCrumb).toContainText('main')

    await sillygit.sidebar.branch('feature').dblclick()
    await expect(sillygit.branchCrumb).toContainText('feature')
  })
})

test.describe('large histories', () => {
  test.beforeEach(async ({ repo }) => {
    repo.addManyCommits(1200)
  })

  test('only draws the rows in view, and loads more as you scroll', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await expect(sillygit.graph.rows.first()).toContainText('Bulk commit 1200')
    expect(await sillygit.graph.rows.count()).toBeLessThan(120)

    const body = sillygit.graph.root
    for (let i = 0; i < 30 && (await sillygit.graph.row('Initial commit').count()) === 0; i++) {
      await body.evaluate((el) => (el.scrollTop = el.scrollHeight))
      await sillygit.page.waitForTimeout(150)
    }
    await expect(sillygit.graph.row('Initial commit')).toBeVisible()
  })

  test('search finds a commit that is not loaded yet and jumps to it', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.page.keyboard.press('ControlOrMeta+f')
    await sillygit.page.keyboard.type('Bulk commit 7')
    const search = sillygit.page.getByRole('searchbox', { name: 'Search commits' })
    await expect(search).toBeFocused()
    // "Bulk commit 7", "70".."79", "700".."799": 111 matches, newest first.
    await expect(sillygit.page.getByText('1 of 111')).toBeVisible()
    await sillygit.details.expectCommit('Bulk commit 799')

    await search.press('Shift+Enter')
    await sillygit.details.expectCommit('Bulk commit 7')
    await expect(sillygit.graph.row('Bulk commit 7').first()).toBeVisible()
  })
})

test('the command palette checks out a branch', async ({ sillygit, repo }) => {
  repo.addFeatureBranch()
  await sillygit.openRepository(repo.path)

  await sillygit.page.keyboard.press('ControlOrMeta+k')
  await sillygit.page.getByRole('textbox', { name: 'Command' }).fill('check out feat')
  const palette = sillygit.page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('option', { selected: true })).toContainText('Check out feature')
  await sillygit.page.keyboard.press('Enter')

  await expect(sillygit.branchCrumb).toContainText('feature')
  await expect(palette).toHaveCount(0)
})
