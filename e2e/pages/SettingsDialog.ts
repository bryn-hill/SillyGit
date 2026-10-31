import { expect, type Locator, type Page } from '@playwright/test'
import { chooseOption } from './Select'

/** The Settings dialog (gear button in the top bar). */
export class SettingsDialog {
  readonly root: Locator
  readonly theme: Locator
  readonly accounts: Locator
  readonly addAccountButton: Locator
  readonly addAccountForm: Locator
  readonly organizationInput: Locator
  readonly tokenInput: Locator
  readonly hostInput: Locator
  readonly emailInput: Locator
  readonly showAvatars: Locator
  readonly mergeAnimation: Locator
  readonly ciSymbols: Locator
  readonly sideBySideDiffs: Locator
  readonly notifications: Locator
  readonly notificationsEnabled: Locator
  readonly notificationInterval: Locator
  readonly testNotificationButton: Locator
  readonly sprints: Locator
  readonly sprintsEnabled: Locator
  readonly sprintLength: Locator
  readonly sprintStart: Locator
  readonly sprintNumber: Locator
  readonly mergeTool: Locator
  readonly staleEnabled: Locator
  readonly staleDays: Locator
  readonly conflictWarnings: Locator
  readonly mergeToolCommand: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('dialog', { name: 'Settings' })
    this.theme = this.root.getByLabel('Appearance')
    this.accounts = this.root.getByRole('region', { name: 'Accounts' })
    this.addAccountButton = this.accounts.getByRole('button', { name: 'Add account…' })
    this.addAccountForm = this.accounts.getByRole('form', { name: 'Add account' })
    this.tokenInput = this.addAccountForm.getByLabel(/^(Personal access|API) token$/)
    this.hostInput = this.addAccountForm.getByLabel('Server')
    this.emailInput = this.addAccountForm.getByLabel('Atlassian account email')
    this.organizationInput = this.addAccountForm.getByLabel('Organization')
    this.showAvatars = this.root.getByRole('checkbox', { name: 'Show author avatars' })
    this.mergeAnimation = this.root.getByRole('checkbox', { name: 'Animate new commits and merges on the graph' })
    this.ciSymbols = this.root.getByRole('checkbox', { name: 'Show CI results as symbols' })
    this.sideBySideDiffs = this.root.getByRole('checkbox', { name: 'Show diffs side by side' })
    this.notifications = this.root.getByRole('region', { name: 'Notifications' })
    this.notificationsEnabled = this.notifications.getByRole('checkbox', { name: 'Pull request notifications' })
    this.notificationInterval = this.notifications.getByLabel('Check')
    this.testNotificationButton = this.notifications.getByRole('button', { name: 'Send a test notification' })
    this.sprints = this.root.getByRole('region', { name: 'Sprints' })
    this.sprintsEnabled = this.sprints.getByRole('checkbox', { name: 'Show sprints on the graph' })
    this.sprintLength = this.sprints.getByLabel('Sprints last')
    this.sprintStart = this.sprints.getByLabel('A sprint started on')
    this.sprintNumber = this.sprints.getByLabel('and was number')
    this.staleEnabled = this.root.getByRole('checkbox', { name: 'Tag stale branches' })
    this.staleDays = this.root.getByLabel('Stale after no commits for')
    this.conflictWarnings = this.root.getByRole('checkbox', { name: 'Warn about branches that would conflict' })
    this.mergeTool = this.root.getByLabel('External merge tool')
    this.mergeToolCommand = this.root.getByLabel('Merge tool command')
  }

  notificationKind(label: string): Locator {
    return this.notifications.getByRole('checkbox', { name: label })
  }

  async close(): Promise<void> {
    await this.root.getByRole('button', { name: 'Close', exact: true }).last().click()
    await expect(this.root).toHaveCount(0)
  }

  /** Picks "Match the system", "Light" or "Dark" under Appearance. */
  async chooseTheme(label: 'Match the system' | 'Light' | 'Dark'): Promise<void> {
    await chooseOption(this.theme, label)
  }

  async open(): Promise<void> {
    await this.page.getByTitle('Settings', { exact: true }).click()
    await expect(this.root).toBeVisible()
  }

  service(label: string): Locator {
    return this.addAccountForm.getByRole('radio', { name: label })
  }

  account(text: string | RegExp): Locator {
    return this.accounts.getByRole('listitem').filter({ hasText: text })
  }

  async addToken(token: string): Promise<void> {
    await this.tokenInput.fill(token)
    await this.addAccountForm.getByRole('button', { name: 'Add account' }).click()
  }
}
