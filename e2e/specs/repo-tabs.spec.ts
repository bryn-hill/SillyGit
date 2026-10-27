import { expect, test } from '../fixtures'
import { FixtureRepo } from '../support/fixtureRepo'

test('opens repositories in tabs and switches between them', async ({ sillygit, repo }) => {
  const other = new FixtureRepo()
  try {
    other.commitFile('other.txt', 'other\n', 'Add other.txt')
    await sillygit.openRepository(repo.path)
    await sillygit.openRepositoryInNewTab(other.path)

    await sillygit.tabs.expectNames([repo.name, other.name])
    await sillygit.tabs.expectActive(other.name)
    await sillygit.graph.expectSubjects(['Add other.txt', ...FixtureRepo.commits])

    await sillygit.tabs.tab(repo.name).click()
    await sillygit.tabs.expectActive(repo.name)
    await expect(sillygit.repositoryCrumb).toContainText(repo.name)
    await sillygit.graph.expectSubjects(FixtureRepo.commits)

    // Opening a repo that already has a tab switches to it instead of adding another.
    await sillygit.openRepositoryInNewTab(other.path)
    await sillygit.tabs.expectNames([repo.name, other.name])
    await sillygit.tabs.expectActive(other.name)

    await sillygit.page.keyboard.press('Control+Tab')
    await sillygit.tabs.expectActive(repo.name)
  } finally {
    other.remove()
  }
})

test('closing the active tab shows its neighbour, and the last one the empty screen', async ({ sillygit, repo }) => {
  const second = new FixtureRepo()
  const third = new FixtureRepo()
  try {
    await sillygit.openRepository(repo.path)
    await sillygit.openRepositoryInNewTab(second.path)
    await sillygit.openRepositoryInNewTab(third.path)
    await sillygit.tabs.tab(second.name).click()

    await sillygit.tabs.close(second.name)
    await sillygit.tabs.expectNames([repo.name, third.name])
    await sillygit.tabs.expectActive(third.name)

    await sillygit.tabs.tab(third.name).click({ button: 'middle' })
    await sillygit.tabs.expectActive(repo.name)

    await sillygit.tabs.close(repo.name)
    await sillygit.tabs.expectNames([])
    await expect(sillygit.emptyState).toBeVisible()
    await expect(sillygit.branchCrumb).toHaveCount(0)
  } finally {
    second.remove()
    third.remove()
  }
})

test('pins tabs into a group on the left and reorders tabs by dragging', async ({ sillygit, repo }) => {
  const second = new FixtureRepo()
  const third = new FixtureRepo()
  try {
    await sillygit.openRepository(repo.path)
    await sillygit.openRepositoryInNewTab(second.path)
    await sillygit.openRepositoryInNewTab(third.path)

    await sillygit.tabs.menu(third.name, 'Pin tab')
    await sillygit.tabs.expectNames([third.name, repo.name, second.name])
    await expect(sillygit.tabs.pinnedGroup.getByRole('tab')).toHaveCount(1)
    // Pinned tabs have no close button.
    await expect(sillygit.tabs.tab(third.name).getByRole('button')).toHaveCount(0)

    await sillygit.tabs.tab(second.name).dragTo(sillygit.tabs.tab(repo.name), { targetPosition: { x: 4, y: 10 } })
    await sillygit.tabs.expectNames([third.name, second.name, repo.name])

    // A press that wobbles a pixel or two is still a click, not a drag.
    const box = (await sillygit.tabs.tab(second.name).boundingBox())!
    await sillygit.page.mouse.move(box.x + 20, box.y + 10)
    await sillygit.page.mouse.down()
    await sillygit.page.mouse.move(box.x + 22, box.y + 11)
    await sillygit.page.mouse.up()
    await sillygit.tabs.expectActive(second.name)
    await sillygit.tabs.expectNames([third.name, second.name, repo.name])

    await sillygit.tabs.menu(repo.name, 'Close other tabs')
    await sillygit.tabs.expectNames([third.name, repo.name])

    await sillygit.tabs.menu(third.name, 'Unpin tab')
    await expect(sillygit.tabs.pinnedGroup).toHaveCount(0)
  } finally {
    second.remove()
    third.remove()
  }
})

test('reopens the same tabs, pins and active tab after a relaunch', async ({ sillygit, repo, relaunch }) => {
  const other = new FixtureRepo()
  try {
    await sillygit.openRepository(repo.path)
    await sillygit.openRepositoryInNewTab(other.path)
    await sillygit.tabs.menu(other.name, 'Pin tab')
    await sillygit.tabs.tab(repo.name).click()
    await sillygit.tabs.expectActive(repo.name)

    const reopened = await relaunch()

    await reopened.tabs.expectNames([other.name, repo.name])
    await expect(reopened.tabs.pinnedGroup.getByRole('tab')).toHaveCount(1)
    await reopened.tabs.expectActive(repo.name)
    await reopened.graph.expectSubjects(FixtureRepo.commits)
  } finally {
    other.remove()
  }
})

test('Launchpad is a tab', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.tabs.launchpad.click()
  await expect(sillygit.tabs.launchpad).toHaveAttribute('aria-selected', 'true')
  await expect(sillygit.tabs.tab(repo.name)).toHaveAttribute('aria-selected', 'false')
  await expect(sillygit.graph.rows.first()).toBeHidden()

  await sillygit.tabs.tab(repo.name).click()
  await sillygit.tabs.expectActive(repo.name)
  await expect(sillygit.graph.rows.first()).toBeVisible()
})

// On macOS the strip doubles as the window's title bar: its empty space drags
// the window, so everything clickable in it has to opt out (see toolbar.spec).
test('tabs, their buttons and menu take clicks instead of dragging the window', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.tabs.tab(repo.name).click({ button: 'right' })
  await expect(sillygit.page.getByRole('menuitem', { name: 'Pin tab' })).toBeVisible()

  const appRegion = (selector: string): Promise<string[]> =>
    sillygit.page.locator(selector).evaluateAll((els) =>
      els.map((el) => (el.ownerDocument.defaultView!.getComputedStyle(el) as unknown as Record<string, string>)['-webkit-app-region'])
    )
  expect(await appRegion('.tab-bar')).toEqual(['drag'])
  const clickable = await appRegion(
    '.tab-bar [role="tab"], .tab-bar [role="tab"] *, .tab-bar button, .context-menu-backdrop, [role="menu"], [role="menu"] *'
  )
  expect(clickable.length).toBeGreaterThan(5)
  expect(clickable.filter((region) => region !== 'no-drag')).toEqual([])
  // The menu hangs over the toolbar's drag region, so it must not live inside
  // the strip: on macOS the toolbar's region, later in the page, would win.
  await expect(sillygit.page.locator('.tab-bar [role="menu"]')).toHaveCount(0)
})
