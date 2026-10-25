import { expect, type Locator, type Page } from '@playwright/test'

/** The full-screen commit view with a file's diff. */
export class CommitView {
  readonly root: Locator
  readonly diff: Locator
  readonly openFile: Locator
  readonly backButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole('region', { name: 'Commit diff' })
    this.diff = this.root.getByTestId('diff')
    this.openFile = this.root.locator('.file-row[aria-current="true"]')
    this.backButton = this.root.getByTitle('Back to repository view')
  }

  file(path: string): Locator {
    return this.root.locator('.file-row').filter({ hasText: path })
  }

  async back(): Promise<void> {
    await this.backButton.click()
  }

  async expectShowing(path: string, diffContains: string): Promise<void> {
    await expect(this.root).toBeVisible()
    await expect(this.openFile).toHaveText(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await expect(this.diff).toContainText(diffContains)
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0)
  }
}
