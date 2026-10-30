import type { Locator, Page } from '@playwright/test'

/** The comparison of two commits or branches, shown in place of the graph. */
export class Compare {
  readonly root: Locator
  readonly title: Locator
  readonly summary: Locator
  readonly files: Locator
  readonly diff: Locator

  constructor(page: Page) {
    this.root = page.getByRole('region', { name: 'Compare' })
    this.title = this.root.locator('.compare-title')
    this.summary = this.root.getByTestId('compare-summary')
    this.files = this.root.getByRole('list', { name: 'Files changed' }).locator('.file-row')
    this.diff = this.root.getByTestId('diff')
  }

  file(path: string): Locator {
    return this.files.filter({ hasText: path })
  }

  /** The commits listed as only in `side`. */
  commitsOnlyIn(side: string): Locator {
    return this.root.getByRole('list', { name: `Only in ${side}` }).locator('.file-row')
  }

  async swap(): Promise<void> {
    await this.root.getByRole('button', { name: /Swap/ }).click()
  }

  async close(): Promise<void> {
    await this.root.getByRole('button', { name: '✕' }).click()
  }
}
