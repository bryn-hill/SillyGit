import type { Locator, Page } from '@playwright/test'

/** The branch list on the left. */
export class Sidebar {
  readonly root: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('navigation', { name: 'Branches' })
  }

  branch(name: string): Locator {
    return this.root.locator('.branch-row').filter({ hasText: new RegExp(`^.?${name}$`) })
  }

  /** Opens the REMOTE section, which starts collapsed. */
  async expandRemotes(): Promise<void> {
    await this.root.locator('.tree-group-header', { hasText: 'REMOTE' }).click()
  }

  /** Right-clicks a branch and picks `item` from its menu. */
  async branchMenu(name: string, item: string | RegExp): Promise<void> {
    await this.branch(name).click({ button: 'right' })
    await this.page.getByRole('menu').getByRole('menuitem', { name: item }).click()
  }
}
