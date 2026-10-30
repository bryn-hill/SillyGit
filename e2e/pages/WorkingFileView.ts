import { expect, type Locator, type Page } from '@playwright/test'

/** An uncommitted file's diff, shown full window with the working changes still listed beside it. */
export class WorkingFileView {
  readonly root: Locator
  readonly diff: Locator
  readonly side: Locator
  readonly stageButton: Locator
  readonly unstageButton: Locator
  readonly closeButton: Locator

  constructor(page: Page) {
    this.root = page.getByRole('region', { name: 'Working file diff' })
    this.diff = this.root.getByTestId('diff')
    this.side = this.root.locator('.working-file-side')
    this.stageButton = this.root.getByRole('button', { name: 'Stage file', exact: true })
    this.unstageButton = this.root.getByRole('button', { name: 'Unstage file', exact: true })
    this.closeButton = this.root.getByRole('button', { name: 'Close file diff' })
  }

  /** The gutter of a changed line, e.g. selectLine('added', 3), which picks it for a hunk action. */
  line(kind: 'added' | 'removed', lineNo: number): Locator {
    return this.diff.getByRole('checkbox', { name: `Select ${kind} line ${lineNo}` })
  }

  /** A button on a hunk's bar, e.g. "Stage Hunk" or "Stage 2 Lines". */
  hunkButton(name: string | RegExp): Locator {
    return this.diff.getByRole('button', { name })
  }

  async expectShowing(path: string, diffContains: string): Promise<void> {
    await expect(this.root).toBeVisible()
    await expect(this.root.locator('.commit-fullview-title')).toHaveText(path)
    await expect(this.diff).toContainText(diffContains)
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0)
  }
}
