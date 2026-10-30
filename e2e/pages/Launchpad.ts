import type { Locator, Page } from '@playwright/test'

/** The Launchpad screen: pull requests by what they need, and issues assigned to you. */
export class Launchpad {
  readonly root: Locator
  readonly issues: Locator
  /** The Start work dialog for an issue. */
  readonly startWork: Locator
  readonly branchName: Locator
  readonly startButton: Locator

  constructor(readonly page: Page) {
    this.root = page.locator('.launchpad')
    this.issues = this.root.getByRole('region', { name: 'Assigned issues' }).getByTestId('launchpad-issue')
    this.startWork = page.getByRole('dialog', { name: /^Start work on #/ })
    this.branchName = this.startWork.getByLabel('Branch name')
    this.startButton = this.startWork.getByRole('button', { name: /^(Start work|Check out)$/ })
  }

  issue(title: string): Locator {
    return this.issues.filter({ hasText: title })
  }

  /** Opens the Start work dialog for the issue titled `title`. */
  async startWorkOn(title: string): Promise<void> {
    await this.issue(title).getByRole('button', { name: 'Start work' }).click()
  }

  stackOn(branch: string): Locator {
    return this.startWork.getByRole('checkbox', { name: `Stack on ${branch}` })
  }
}
