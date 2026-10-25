import { expect, type Locator, type Page } from '@playwright/test'

/** The side bar showing the selected commit (or the working changes). */
export class DetailPanel {
  readonly root: Locator
  readonly subject: Locator

  constructor(page: Page) {
    this.root = page.getByRole('complementary', { name: 'Details' })
    this.subject = this.root.getByTestId('commit-subject')
  }

  file(path: string): Locator {
    return this.root.locator('.file-row').filter({ hasText: path })
  }

  async openFile(path: string): Promise<void> {
    await this.file(path).click()
  }

  async expectCommit(subject: string): Promise<void> {
    await expect(this.subject).toHaveText(subject)
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0)
  }
}
