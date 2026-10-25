import { expect, type Locator, type Page } from '@playwright/test'

export class ClaudePanel {
  readonly root: Locator
  readonly tabs: Locator
  readonly emptyState: Locator
  readonly closeButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole('complementary', { name: 'Claude Code' })
    this.tabs = this.root.getByTestId('claude-tab')
    this.emptyState = this.root.getByText('Ask Claude to work in this repository.')
    this.closeButton = this.root.getByTitle('Close panel')
  }

  async close(): Promise<void> {
    await this.closeButton.click()
  }

  async expectOpen(): Promise<void> {
    await expect(this.root).toBeVisible()
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toBeHidden()
  }
}
