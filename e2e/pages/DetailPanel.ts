import { expect, type Locator, type Page } from '@playwright/test'

/** The side bar showing the selected commit (or the working changes). */
export class DetailPanel {
  readonly root: Locator
  readonly subject: Locator
  readonly commitMessage: Locator
  /** The selected commit's Verified / Unverified / Unsigned badge. */
  readonly signatureBadge: Locator
  /** The co-authors credited on the selected commit. */
  readonly commitCoAuthors: Locator
  /** The commit box's co-author chips. */
  readonly coAuthorChips: Locator
  readonly coAuthorPicker: Locator

  constructor(page: Page) {
    this.root = page.getByRole('complementary', { name: 'Details' })
    this.subject = this.root.getByTestId('commit-subject')
    this.commitMessage = this.root.getByRole('textbox', { name: 'Commit message' })
    this.signatureBadge = this.root.getByTestId('signature-badge')
    this.commitCoAuthors = this.root.locator('.commit-co-authors').getByRole('listitem')
    this.coAuthorChips = this.root.locator('.co-author-chips').getByRole('listitem')
    this.coAuthorPicker = page.getByRole('dialog', { name: 'Add co-authors' })
  }

  /** Opens one of the commit box toolbar's menus: "Quick actions", "Recent" or "Type". */
  async openCommitMenu(name: 'Quick actions' | 'Recent' | 'Type'): Promise<void> {
    await this.root.getByRole('button', { name: `${name} ▾` }).click()
  }

  /** Opens the commit box's co-author picker and searches it. */
  async searchCoAuthors(query: string): Promise<void> {
    await this.root.getByRole('button', { name: /^Co-authors/ }).click()
    await this.coAuthorPicker.getByRole('combobox', { name: 'Search co-authors' }).fill(query)
  }

  coAuthorOption(name: string): Locator {
    return this.coAuthorPicker.getByRole('option', { name: new RegExp(name) })
  }

  async closeCoAuthors(): Promise<void> {
    await this.root.page().keyboard.press('Escape')
    await expect(this.coAuthorPicker).toHaveCount(0)
  }

  async removeCoAuthor(name: string): Promise<void> {
    await this.root.getByRole('button', { name: `Remove co-author ${name}` }).click()
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
