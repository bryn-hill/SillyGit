import { expect, type Locator, type Page } from '@playwright/test'
import { dragOnto } from '../support/drag'

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

  get searchBox(): Locator {
    return this.root.page().getByRole('searchbox', { name: 'Search commits' })
  }

  /** The Branch / Tag cell of a commit's row. */
  refCell(subject: string): Locator {
    return this.row(subject).getByTestId('ref-cell')
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

  /** The bisect marker on a commit's row ("good", "bad", "testing", "first bad"...). */
  bisectMark(subject: string): Locator {
    return this.row(subject).getByTestId('bisect-mark')
  }

  /** The merge animation drawn over a new merge commit's row while it plays. */
  get mergeBurst(): Locator {
    return this.root.getByTestId('merge-burst')
  }

  /** The menu that opens after dropping something on a branch. */
  get dropMenu(): Locator {
    return this.root.page().getByRole('menu')
  }

  /** Drags a branch label onto another branch's label. */
  async dragBranch(label: string, onto: string): Promise<void> {
    await dragOnto(this.badge(label), this.badge(onto))
  }

  /** Drags a commit row (by subject) onto a branch label. */
  async dragCommit(subject: string, onto: string): Promise<void> {
    await dragOnto(this.row(subject).locator('.graph-row-message'), this.badge(onto))
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
