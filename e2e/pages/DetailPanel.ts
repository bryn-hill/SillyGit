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

  /** The "LFS" tag on a file row whose file is stored in Git LFS. */
  lfsBadge(row: Locator): Locator {
    return row.getByLabel('Stored in Git LFS')
  }

  /** The row marked as open in the main area. */
  get activeFile(): Locator {
    return this.root.locator('.file-row[aria-current="true"]')
  }

  /** A file row in one of the working-change lists, e.g. "Unstaged" or "Staged". */
  listedFile(list: 'Unstaged' | 'Staged', path: string): Locator {
    return this.root
      .locator('.detail-section')
      .filter({ has: this.root.page().locator('.detail-section-header', { hasText: new RegExp(`^${list} \\(`) }) })
      .locator('.file-row')
      .filter({ hasText: path })
  }

  /** Opens a working-directory file in the in-app editor from its row's pencil button. */
  async editFile(path: string): Promise<void> {
    await this.file(path).getByRole('button', { name: `Edit ${path}` }).click()
  }

  /** Right-clicks a file row and picks a menu item, e.g. "Blame" or "File history". */
  async fileMenu(path: string, item: string): Promise<void> {
    await this.file(path).click({ button: 'right' })
    await this.root.page().getByRole('menuitem', { name: item, exact: true }).click()
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
