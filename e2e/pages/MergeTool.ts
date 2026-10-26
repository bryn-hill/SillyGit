import { expect, type Locator, type Page } from '@playwright/test'

/** The full-screen A / B / Output merge tool for one conflicted file. */
export class MergeTool {
  readonly root: Locator
  readonly current: Locator
  readonly incoming: Locator
  readonly output: Locator
  readonly outputLines: Locator
  readonly position: Locator
  readonly saveButton: Locator
  readonly unresolvedPrompt: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('region', { name: 'Merge tool' })
    this.current = this.root.getByRole('region', { name: /^A \(current\)/ })
    this.incoming = this.root.getByRole('region', { name: /^B \(incoming\)/ })
    this.output = this.root.getByRole('region', { name: 'Output' })
    this.outputLines = this.output.getByTestId('merge-output').locator('.merge-text')
    this.position = this.output.getByTestId('conflict-position')
    this.saveButton = this.root.getByRole('button', { name: 'Save', exact: true })
    this.unresolvedPrompt = page.getByRole('alertdialog', { name: 'Unresolved conflicts' })
  }

  async takeHunk(side: 'A' | 'B', conflict: number): Promise<void> {
    await this.root.getByRole('checkbox', { name: `Take ${side} conflict ${conflict}` }).click()
  }

  async takeAll(side: 'A' | 'B'): Promise<void> {
    await this.root.getByRole('checkbox', { name: `Take all from ${side}` }).click()
  }

  async toggleLine(side: 'A' | 'B', lineNo: number): Promise<void> {
    await this.root.getByRole('button', { name: new RegExp(`^(Take|Don't take) ${side} line ${lineNo}$`) }).click()
  }

  async expectOutput(lines: string[]): Promise<void> {
    await expect(this.outputLines).toHaveText(lines)
  }

  async saveWithShortcut(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+s')
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0)
  }
}
