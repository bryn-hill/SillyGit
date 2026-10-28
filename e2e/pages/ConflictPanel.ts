import { expect, type Locator, type Page } from '@playwright/test'

/** The conflict parts of the side bar's working changes: header, Conflicted Files, commit/abort buttons. */
export class ConflictPanel {
  readonly header: Locator
  readonly conflictedFiles: Locator
  readonly markAllResolvedButton: Locator

  constructor(private readonly page: Page) {
    const details = page.getByRole('complementary', { name: 'Details' })
    this.header = details.getByRole('status', { name: 'Operation in progress' })
    this.conflictedFiles = details.getByRole('region', { name: 'Conflicted files' })
    this.markAllResolvedButton = this.conflictedFiles.getByRole('button', { name: 'Mark All Resolved' })
  }

  file(path: string): Locator {
    return this.conflictedFiles.locator('.file-row').filter({ hasText: path })
  }

  button(name: string | RegExp): Locator {
    return this.page.getByRole('complementary', { name: 'Details' }).getByRole('button', { name })
  }

  /** Adds a file to the selection with Cmd/Ctrl-click, without opening it. */
  async toggleSelect(path: string): Promise<void> {
    await this.file(path).click({ modifiers: ['ControlOrMeta'] })
  }

  get undoBanner(): Locator {
    return this.page.getByRole('status', { name: 'Undo conflict action' })
  }

  async openFile(path: string): Promise<void> {
    await this.file(path).click()
  }

  async fileMenu(path: string, item: string | RegExp): Promise<void> {
    await this.file(path).click({ button: 'right' })
    await this.page.getByRole('menu').getByRole('menuitem', { name: item }).click()
  }

  async expectConflicts(title: string, summary: string | RegExp, files: string[]): Promise<void> {
    await expect(this.header).toContainText(title)
    await expect(this.header).toContainText(summary)
    await expect(this.conflictedFiles.locator('.file-path')).toHaveText(files)
  }

  async expectNoConflictedFiles(): Promise<void> {
    await expect(this.conflictedFiles).toHaveCount(0)
  }
}
