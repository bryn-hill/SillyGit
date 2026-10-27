import { expect, type Locator, type Page } from '@playwright/test'

/** The in-app Monaco editor for a working-tree file, shown in place of the commit graph. */
export class FileEditor {
  readonly root: Locator
  readonly code: Locator
  readonly saveButton: Locator
  readonly closeButton: Locator
  readonly externalButton: Locator
  readonly unsavedMarker: Locator
  readonly status: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('region', { name: 'Edit file' })
    this.code = this.root.getByTestId('file-editor-monaco').locator('.view-lines')
    this.saveButton = this.root.getByRole('button', { name: 'Save', exact: true })
    this.closeButton = this.root.getByRole('button', { name: 'Close editor' })
    this.externalButton = this.root.getByRole('button', { name: 'Open in external editor' })
    this.unsavedMarker = this.root.getByLabel('Unsaved changes')
    this.status = this.root.getByRole('status')
  }

  async expectOpen(path: string, text: string): Promise<void> {
    await expect(this.root).toBeVisible()
    await expect(this.root).toContainText(path.split('/').pop()!)
    await expect(this.code).toContainText(text)
  }

  /** Puts the cursor at the end of the file and types `text`. */
  async appendText(text: string): Promise<void> {
    await this.code.click()
    await this.page.keyboard.press('ControlOrMeta+End')
    await this.page.keyboard.type(text)
  }

  async saveWithShortcut(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+S')
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0)
  }
}
