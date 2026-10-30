import type { Locator, Page } from '@playwright/test'

/** The Repositories tab: every known repo, in groups, with its branch and changes. */
export class RepoOverview {
  readonly tab: Locator
  readonly root: Locator
  readonly rows: Locator

  constructor(readonly page: Page) {
    this.tab = page.getByRole('tablist', { name: 'Open repositories' }).getByRole('tab', { name: 'Repositories' })
    this.root = page.getByTestId('repo-overview')
    this.rows = this.root.getByTestId('repo-overview-row')
  }

  row(name: string): Locator {
    return this.rows.filter({ has: this.page.getByText(name, { exact: true }) })
  }

  group(name: string): Locator {
    return this.root.getByRole('region', { name, exact: true })
  }

  async newGroup(name: string): Promise<void> {
    await this.root.getByRole('button', { name: '+ New group' }).click()
    await this.root.getByLabel('New group name').fill(name)
    await this.root.getByRole('button', { name: 'Add group' }).click()
  }

  async moveToGroup(repo: string, group: string): Promise<void> {
    await this.root.getByRole('combobox', { name: `Group for ${repo}` }).click()
    await this.page.getByRole('option', { name: group, exact: true }).click()
  }
}
