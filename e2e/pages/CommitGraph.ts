import { expect, type Locator, type Page } from '@playwright/test'

export class CommitGraph {
  readonly root: Locator
  readonly rows: Locator
  readonly selectedRow: Locator

  constructor(page: Page) {
    this.root = page.getByRole('listbox', { name: 'Commits' })
    this.rows = this.root.getByRole('option')
    this.selectedRow = this.root.getByRole('option', { selected: true })
  }

  row(subject: string): Locator {
    return this.rows.filter({ hasText: subject })
  }

  /** A branch or tag label on a commit row. */
  badge(label: string): Locator {
    return this.root.locator('.ref-badge').filter({ hasText: new RegExp(`^${label}$`) })
  }

  workingChangesRow(): Locator {
    return this.row('Uncommitted changes')
  }

  async select(subject: string): Promise<void> {
    await this.row(subject).click()
  }

  async expectSubjects(subjects: readonly string[]): Promise<void> {
    await expect(this.rows.locator('.graph-row-subject')).toHaveText([...subjects])
  }

  async expectSelected(subject: string): Promise<void> {
    await expect(this.row(subject)).toHaveAttribute('aria-selected', 'true')
  }

  async expectNothingSelected(): Promise<void> {
    await expect(this.selectedRow).toHaveCount(0)
  }
}
