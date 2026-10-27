import { expect, type Locator, type Page } from '@playwright/test'

/** The Settings dialog (gear button in the top bar). */
export class SettingsDialog {
  readonly root: Locator
  readonly accounts: Locator
  readonly addAccountButton: Locator
  readonly addAccountForm: Locator
  readonly tokenInput: Locator
  readonly hostInput: Locator
  readonly showAvatars: Locator
  readonly notifications: Locator
  readonly notificationsEnabled: Locator
  readonly notificationInterval: Locator
  readonly testNotificationButton: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('dialog', { name: 'Settings' })
    this.accounts = this.root.getByRole('region', { name: 'Accounts' })
    this.addAccountButton = this.accounts.getByRole('button', { name: 'Add account…' })
    this.addAccountForm = this.accounts.getByRole('form', { name: 'Add account' })
    this.tokenInput = this.addAccountForm.getByLabel('Personal access token')
    this.hostInput = this.addAccountForm.getByLabel('Server')
    this.showAvatars = this.root.getByRole('checkbox', { name: 'Show author avatars' })
    this.notifications = this.root.getByRole('region', { name: 'Notifications' })
    this.notificationsEnabled = this.notifications.getByRole('checkbox', { name: 'Pull request notifications' })
    this.notificationInterval = this.notifications.getByLabel('Check')
    this.testNotificationButton = this.notifications.getByRole('button', { name: 'Send a test notification' })
  }

  notificationKind(label: string): Locator {
    return this.notifications.getByRole('checkbox', { name: label })
  }

  async close(): Promise<void> {
    await this.root.getByRole('button', { name: 'Close', exact: true }).last().click()
    await expect(this.root).toHaveCount(0)
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
