import { expect, type Locator, type Page } from '@playwright/test'

/** The bisect bar under the toolbar, and the bisect items of a commit's right-click menu. */
export class Bisect {
  readonly banner: Locator
  readonly summary: Locator

  constructor(readonly page: Page) {
    this.banner = page.getByRole('region', { name: 'Bisect' })
    this.summary = this.banner.getByTestId('bisect-summary')
  }

  /** A button on the bisect bar: "Good", "Bad", "Skip", "Run a command to decide…", "Reset", "Show commit". */
  button(name: string): Locator {
    return this.banner.getByRole('button', { name, exact: true })
  }

  /** Lets a command decide each commit: picks "Other command…" and types it in. */
  async runCommand(command: string): Promise<void> {
    await this.button('Run a command to decide…').click()
    await this.page.getByRole('menuitem', { name: 'Other command…' }).click()
    const prompt = this.page.getByRole('dialog', { name: 'Run a command to decide' })
    await prompt.getByRole('textbox').fill(command)
    await prompt.getByRole('button', { name: 'Run' }).click()
  }

  async expectFinished(): Promise<void> {
    await expect(this.summary).toContainText('Bisect found the first bad commit')
  }
}
