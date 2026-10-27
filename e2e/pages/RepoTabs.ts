import { expect, type Locator, type Page } from '@playwright/test'

/** The repo tabs across the top of the window, with Launchpad and the + button. */
export class RepoTabs {
  readonly root: Locator
  readonly launchpad: Locator
  readonly newTabButton: Locator
  readonly pinnedGroup: Locator

  constructor(readonly page: Page) {
    this.root = page.getByRole('tablist', { name: 'Open repositories' })
    this.launchpad = this.root.getByRole('tab', { name: 'Launchpad' })
    this.newTabButton = this.root.getByRole('button', { name: 'New tab', exact: true })
    this.pinnedGroup = this.root.getByRole('group', { name: 'Pinned tabs' })
  }

  /** Every tab, Launchpad included. */
  get all(): Locator {
    return this.root.getByRole('tab')
  }

  tab(name: string): Locator {
    return this.root.getByRole('tab', { name: new RegExp(`^${name}`) })
  }

  async expectNames(names: string[]): Promise<void> {
    await expect(this.root.locator('.repo-tab:not(.launchpad-tab) .repo-tab-name')).toHaveText(names)
  }

  async expectActive(name: string): Promise<void> {
    await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true')
  }

  async close(name: string): Promise<void> {
    await this.tab(name).hover()
    await this.tab(name).getByRole('button', { name: `Close ${name}` }).click()
  }

  /** Right-clicks a tab and picks `item` from its menu, e.g. "Pin tab". */
  async menu(name: string, item: string): Promise<void> {
    await this.tab(name).click({ button: 'right' })
    await this.page.getByRole('menuitem', { name: item, exact: true }).click()
  }
}
