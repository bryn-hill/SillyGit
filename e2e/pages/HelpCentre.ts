import { expect, type Locator, type Page } from '@playwright/test'

/** The help centre window and the top bar's Help menu that opens it. */
export class HelpCentre {
  readonly dialog: Locator
  readonly search: Locator
  readonly results: Locator
  readonly topics: Locator
  readonly article: Locator
  readonly backButton: Locator
  readonly closeButton: Locator
  readonly helpButton: Locator
  readonly helpMenu: Locator

  constructor(readonly page: Page) {
    this.dialog = page.getByRole('dialog', { name: 'Help centre' })
    this.search = this.dialog.getByRole('searchbox', { name: 'Search help' })
    this.results = this.dialog.getByRole('navigation', { name: 'Search results' })
    this.topics = this.dialog.getByRole('navigation', { name: 'Help topics' })
    this.article = this.dialog.locator('article')
    this.backButton = this.dialog.getByRole('button', { name: 'Back' })
    this.closeButton = this.dialog.getByRole('button', { name: 'Close help' })
    this.helpButton = page.getByRole('button', { name: 'Help', exact: true })
    this.helpMenu = page.getByRole('menu', { name: 'Help' })
  }

  /** Picks an item from the top bar's Help menu. */
  async chooseFromMenu(item: string): Promise<void> {
    await this.helpButton.click()
    await this.helpMenu.getByRole('menuitem', { name: item }).click()
  }

  /** Expects the article titled `title` to be on show. */
  async expectArticle(title: string): Promise<void> {
    await expect(this.article.getByRole('heading', { level: 2 })).toHaveText(title)
  }
}
