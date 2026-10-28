import { expect, type Locator, type Page } from '@playwright/test'

/** The interactive rebase editor that replaces the graph: commits newest first, an action each. */
export class InteractiveRebase {
  readonly root: Locator
  readonly list: Locator
  readonly rows: Locator
  readonly startButton: Locator
  readonly cancelButton: Locator
  readonly message: Locator
  readonly error: Locator
  readonly summary: Locator

  constructor(page: Page) {
    this.root = page.getByRole('region', { name: 'Interactive rebase' })
    this.list = this.root.getByRole('list', { name: 'Commits to rebase' })
    this.rows = this.list.getByRole('listitem').and(page.locator('[data-hash]'))
    this.startButton = this.root.getByRole('button', { name: 'Start Rebase' })
    this.cancelButton = this.root.getByRole('button', { name: 'Cancel' })
    this.message = this.root.getByRole('textbox', { name: 'Commit message text' })
    this.error = this.root.getByRole('alert')
    this.summary = this.root.getByTestId('rebase-summary')
  }

  row(subject: string): Locator {
    return this.list.getByRole('listitem', { name: subject, exact: true })
  }

  async setAction(subject: string, action: 'Pick' | 'Reword' | 'Squash' | 'Fixup' | 'Drop'): Promise<void> {
    await this.row(subject).getByRole('combobox').selectOption({ label: action })
  }

  /** Drags a commit onto the top half of another, landing it just above that one. */
  async dragAbove(subject: string, target: string): Promise<void> {
    await this.row(subject).dragTo(this.row(target), { targetPosition: { x: 200, y: 4 } })
  }

  /** Moves a commit with the keyboard: Alt+Up / Alt+Down. */
  async move(subject: string, direction: 'up' | 'down', times = 1): Promise<void> {
    await this.row(subject).locator('.rebase-hash').click()
    for (let i = 0; i < times; i++) await this.row(subject).press(direction === 'up' ? 'Alt+ArrowUp' : 'Alt+ArrowDown')
  }

  async expectSubjects(subjects: string[]): Promise<void> {
    await expect(this.rows.locator('.rebase-subject')).toHaveText(subjects)
  }
}
