import { expect, test } from '../fixtures'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox()
  expect(b, 'element should be laid out').not.toBeNull()
  return b!
}

function overlaps(a: Box, b: Box): boolean {
  // A pixel of touching borders is not an overlap.
  return a.x + a.width > b.x + 1 && b.x + b.width > a.x + 1 && a.y + a.height > b.y + 1 && b.y + b.height > a.y + 1
}

/** The visible buttons in the top bar, which must not draw over one another. */
async function topBarButtonBoxes(topBar: Locator): Promise<{ name: string; box: Box }[]> {
  const out: { name: string; box: Box }[] = []
  for (const button of await topBar.getByRole('button').all()) {
    if (!(await button.isVisible())) continue
    const name = (await button.getAttribute('aria-label')) ?? (await button.getAttribute('title')) ?? ''
    out.push({ name, box: await box(button) })
  }
  return out
}

const LONG_SUBJECT = 'feat(graph): a commit subject long enough that it has to be cut short at half-screen width'
const SESSION_URL = 'https://claude.ai/code/session_01ArkJ6KEqPAVeryLongTokenWithNoSpacesThatMustWrap'

test.describe('at half-screen width', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    repo.commitFileAt('sprint.txt', 'x\n', `${LONG_SUBJECT}\n\nClaude-Session: ${SESSION_URL}`, '2030-01-08T12:00:00')
    repo.git('branch', 'claude/project-thread-with-a-very-long-branch-name')
    await sillygit.openRepository(repo.path)
    await sillygit.settings.open()
    await sillygit.settings.sprintsEnabled.check()
    await sillygit.settings.sprintStart.fill('2030-01-07')
    await sillygit.settings.close()
    await sillygit.resizeWindow(750, 900)
  })

  test('nothing in the top bar, graph or detail panel draws over anything else', async ({ sillygit }) => {
    const { graph, details, topBar, page } = sillygit
    await graph.row('Add hello.txt').click()
    await expect(details.root).toBeVisible()

    // Toolbar labels give way to icons; every button keeps its own space inside the bar.
    const bar = await box(topBar)
    const buttons = await topBarButtonBoxes(topBar)
    expect(buttons.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Undo', 'Pull', 'Push', 'Create branch', 'Run', 'Actions'])
    )
    for (const [i, a] of buttons.entries()) {
      expect(a.box.x, `${a.name} starts inside the window`).toBeGreaterThanOrEqual(bar.x)
      expect(a.box.x + a.box.width, `${a.name} ends inside the window`).toBeLessThanOrEqual(bar.x + bar.width)
      for (const b of buttons.slice(i + 1)) {
        // A split button's caret tucks into its button's corner on purpose.
        if (b.name === `${a.name} options`) continue
        expect(overlaps(a.box, b.box), `${a.name} overlaps ${b.name}`).toBe(false)
      }
    }

    // The search box stays inside the graph instead of running into the detail panel.
    const graphBox = await box(graph.root)
    const search = await box(graph.searchBox)
    expect(search.x + search.width).toBeLessThanOrEqual(graphBox.x + graphBox.width)
    expect(overlaps(search, await box(details.root))).toBe(false)

    // The sprint label stays clear of the Branch / Tag column.
    const marker = graph.sprintMarker(LONG_SUBJECT)
    await expect(marker).toBeVisible()
    expect(overlaps(await box(marker), await box(graph.refCell(LONG_SUBJECT)))).toBe(false)

    // The subject still gets a readable share of the row.
    const subject = graph.row(LONG_SUBJECT).locator('.graph-row-subject')
    expect((await box(subject)).width).toBeGreaterThan(120)

    // A long unbroken line in the message wraps rather than running off the panel.
    await graph.row(LONG_SUBJECT).click()
    await expect(details.root).toContainText(SESSION_URL.slice(0, 20))
    const fits = await details.root.evaluate((el) => el.scrollWidth <= el.clientWidth)
    expect(fits).toBe(true)
    expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(750)
  })

  test('Redo, Stash and Pop move into the More menu when the window is narrower still', async ({ sillygit, repo }) => {
    await expect(sillygit.moreButton).toBeHidden()
    await expect(sillygit.toolbarButton('Stash')).toBeVisible()

    await sillygit.resizeWindow(640, 900)
    await expect(sillygit.toolbarButton('Stash')).toBeHidden()
    await expect(sillygit.moreButton).toBeVisible()

    repo.writeFile('hello.txt', 'changed\n')
    await expect(sillygit.graph.row('Uncommitted changes')).toBeVisible()
    await sillygit.moreButton.click()
    const menu = sillygit.page.getByRole('menu', { name: 'More actions' })
    await expect(menu.getByRole('menuitem', { name: 'Redo' })).toHaveAttribute('aria-disabled', 'true')
    await menu.getByRole('menuitem', { name: 'Stash' }).click()
    await expect(menu).toBeHidden()
    await expect(sillygit.graph.row('Uncommitted changes')).toHaveCount(0)
    expect(repo.git('stash', 'list')).toContain('stash@{0}')
  })
})
