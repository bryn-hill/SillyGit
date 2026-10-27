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

  /**
   * A branch or tag in the Branch / Tag column, by its full name. A remote
   * branch that shares a pill with its local branch is the pill's cloud icon.
   */
  badge(label: string): Locator {
    return this.root.locator(`[data-ref="${label}"]`)
  }

  /** The "+N" chip on a commit row with more refs than fit. */
  moreRefs(subject: string): Locator {
    return this.row(subject).getByRole('button', { name: /more branches and tags/ })
  }

  /** The Branch / Tag column's resize handle. */
  get refColumnResizer(): Locator {
    return this.root.page().getByRole('separator', { name: 'Resize branch and tag column' })
  }

  /** The "Sprint N · dates" labels drawn above the newest commit of each sprint. */
  get sprintMarkers(): Locator {
    return this.root.getByTestId('sprint-marker')
  }

  /** The sprint label above a commit's row, when it's the newest commit of its sprint. */
  sprintMarker(subject: string): Locator {
    return this.row(subject).getByTestId('sprint-marker')
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
