import { expect, type Locator, type Page } from '@playwright/test'

/** A file's history (commits that changed it, with each diff) or blame, shown in place of the graph. */
export class FileHistory {
  readonly root: Locator
  readonly historyTab: Locator
  readonly blameTab: Locator
  readonly closeButton: Locator
  /** The commits that changed the file, newest first. */
  readonly entries: Locator
  readonly activeEntry: Locator
  readonly diff: Locator
  readonly blame: Locator
  readonly blameBar: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('region', { name: 'File history and blame' })
    this.historyTab = this.root.getByRole('button', { name: 'History', exact: true })
    this.blameTab = this.root.getByRole('button', { name: 'Blame', exact: true })
    this.closeButton = this.root.getByRole('button', { name: 'Close file view' })
    this.entries = this.root.getByRole('list', { name: 'Commits changing this file' }).getByRole('listitem')
    this.activeEntry = this.entries.and(this.root.locator('[aria-current="true"]'))
    this.diff = this.root.getByTestId('diff')
    this.blame = this.root.getByTestId('blame')
    this.blameBar = this.root.locator('.blame-bar')
  }

  entry(subject: string): Locator {
    return this.entries.filter({ hasText: subject })
  }

  /** The blame gutter of a line, 1-based. */
  gutter(lineNo: number): Locator {
    return this.blame.locator(`.blame-row[data-line="${lineNo}"] .blame-gutter`)
  }

  /** Right-clicks a line's blame gutter and picks a menu item. */
  async lineMenu(lineNo: number, item: string): Promise<void> {
    await this.gutter(lineNo).click({ button: 'right' })
    await this.page.getByRole('menuitem', { name: item }).click()
  }

  async expectHistory(subjects: readonly string[]): Promise<void> {
    await expect(this.root).toBeVisible()
    await expect(this.historyTab).toHaveAttribute('aria-pressed', 'true')
    await expect(this.entries.locator('.file-history-entry-subject')).toHaveText([...subjects])
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0)
  }
}
