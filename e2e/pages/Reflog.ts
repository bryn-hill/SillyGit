import type { Locator, Page } from '@playwright/test'
import { chooseOption } from './Select'

/** The Activity log's Reflog tab: where HEAD or a branch has pointed. */
export class Reflog {
  readonly dialog: Locator
  readonly tab: Locator
  readonly refPicker: Locator
  readonly entries: Locator

  constructor(readonly page: Page) {
    this.dialog = page.getByRole('dialog', { name: 'Activity log' })
    this.tab = this.dialog.getByRole('tab', { name: 'Reflog' })
    this.refPicker = this.dialog.getByRole('combobox', { name: 'Reflog of' })
    this.entries = this.dialog.getByRole('list', { name: 'Reflog entries' }).getByRole('listitem')
  }

  /** The entry whose text includes `text`, e.g. "HEAD@{1}" or a reflog message. */
  entry(text: string): Locator {
    return this.entries.filter({ hasText: text }).first()
  }

  async showRef(ref: string): Promise<void> {
    await chooseOption(this.refPicker, ref)
  }

  /** Opens an entry's actions menu and picks `item` ("Show in graph", "Create branch here…"…). */
  async act(text: string, item: string): Promise<void> {
    const entry = this.entry(text)
    await entry.hover()
    await entry.getByRole('button', { name: /^Actions for/ }).click()
    await this.page.getByRole('menuitem', { name: item }).click()
  }
}
