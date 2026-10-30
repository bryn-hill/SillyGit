import { expect, test } from '../fixtures'
import { HelpCentre } from '../pages/HelpCentre'
import { Tour } from '../pages/Tour'

test.describe('help centre', () => {
  test('opens from the Help menu, searches, and follows links between articles', async ({ sillygit, repo }) => {
    const help = new HelpCentre(sillygit.page)
    await sillygit.openRepository(repo.path)

    await help.chooseFromMenu('Help centre')
    await expect(help.dialog).toBeVisible()
    await expect(help.dialog.getByRole('heading', { name: 'How can we help?' })).toBeVisible()
    await expect(help.search).toBeFocused()

    await help.search.fill('merge conflict')
    await expect(help.results.getByRole('heading', { name: 'Merge conflicts' })).toBeVisible()
    await help.results.getByRole('button', { name: /^Resolve merge conflicts/ }).click()
    await help.expectArticle('Resolve merge conflicts')
    await expect(help.article.getByRole('heading', { name: 'Example' })).toBeVisible()

    // Links in the body and the Related list open other articles; Back retraces them.
    await help.article.getByRole('link', { name: 'merge tool' }).first().click()
    await help.expectArticle('Use the merge tool')
    await help.article.getByRole('region', { name: 'Related articles' }).getByRole('button', { name: 'Resolve many files at once' }).click()
    await help.expectArticle('Resolve many files at once')
    await help.backButton.click()
    await help.expectArticle('Use the merge tool')

    await help.closeButton.click()
    await expect(help.dialog).toHaveCount(0)
  })

  test('F1 and ? open it, Escape closes it, and the menu opens the shortcuts', async ({ sillygit, repo }) => {
    const help = new HelpCentre(sillygit.page)
    await sillygit.openRepository(repo.path)
    await sillygit.graph.row('Initial commit').click()

    await sillygit.page.keyboard.press('F1')
    await expect(help.dialog).toBeVisible()
    await sillygit.page.keyboard.press('Escape')
    await expect(help.dialog).toHaveCount(0)

    await sillygit.page.keyboard.press('Shift+?')
    await expect(help.dialog).toBeVisible()
    await sillygit.page.keyboard.press('Escape')
    await expect(help.dialog).toHaveCount(0)

    await help.chooseFromMenu('Keyboard shortcuts')
    await help.expectArticle('Keyboard shortcuts')
    await expect(help.topics.getByRole('button', { name: 'Keyboard shortcuts' })).toHaveAttribute('aria-current', 'page')
  })

  test('every article is in the command palette', async ({ sillygit, repo }) => {
    const help = new HelpCentre(sillygit.page)
    await sillygit.openRepository(repo.path)

    await sillygit.page.keyboard.press('ControlOrMeta+k')
    await sillygit.page.getByRole('textbox', { name: 'Command' }).fill('help interactive rebase')
    const palette = sillygit.page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette.getByRole('option', { selected: true })).toContainText('Rewrite history with interactive rebase')
    await sillygit.page.keyboard.press('Enter')
    await help.expectArticle('Rewrite history with interactive rebase')
  })

  test("the walkthrough's Learn more opens the step's article on top of the tour", async ({ sillygit, repo }) => {
    const help = new HelpCentre(sillygit.page)
    const tour = new Tour(sillygit.page)
    await sillygit.openRepository(repo.path)

    await help.chooseFromMenu('Start walkthrough')
    await tour.expectStep('Welcome to SillyGit')
    await tour.card.getByRole('button', { name: /Learn more/ }).click()
    await help.expectArticle('Welcome to SillyGit')
    // Keys go to the help centre, not the walkthrough behind it.
    await help.search.press('ArrowRight')
    await sillygit.page.keyboard.press('Escape')
    await expect(help.dialog).toHaveCount(0)
    await tour.expectStep('Welcome to SillyGit')
  })
})

// A top-bar menu left in the macOS window-drag region can't be clicked there, and
// Playwright's clicks get through anyway, so check the computed style.
test('the Help button and menu take clicks instead of dragging the window', async ({ sillygit, repo }) => {
  const help = new HelpCentre(sillygit.page)
  await sillygit.openRepository(repo.path)
  await help.helpButton.click()
  await expect(help.helpMenu).toBeVisible()
  const dragRegions = await sillygit.page
    .locator('.help-menu, .help-menu *')
    .evaluateAll((els) =>
      els
        .filter((el) => {
          const style = el.ownerDocument.defaultView!.getComputedStyle(el) as unknown as Record<string, string>
          return style['-webkit-app-region'] !== 'no-drag'
        })
        .map((el) => el.outerHTML.slice(0, 80))
    )
  expect(dragRegions).toEqual([])
  await sillygit.page.keyboard.press('Escape')
  await expect(help.helpMenu).toHaveCount(0)
})
