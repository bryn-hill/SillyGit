import { expect, type Locator, type Page } from '@playwright/test'

/** Lanes (virtual branches) in the side bar for the working changes. */
export class Lanes {
  readonly page: Page
  readonly root: Locator
  readonly startButton: Locator
  readonly newLaneButton: Locator
  readonly menuButton: Locator
  readonly drift: Locator

  constructor(page: Page) {
    this.page = page
    const details = page.getByRole('complementary', { name: 'Details' })
    this.root = details.locator('.lanes-view')
    this.startButton = details.getByRole('button', { name: 'Lanes…' })
    this.newLaneButton = this.root.getByRole('button', { name: '+ Lane' })
    this.menuButton = this.root.getByRole('button', { name: 'Lanes actions' })
    this.drift = this.root.getByRole('alert')
  }

  lane(name: string): Locator {
    return this.root.getByRole('region', { name: `Lane ${name}` })
  }

  file(lane: string, path: string): Locator {
    return this.lane(lane).locator('.file-row').filter({ hasText: path })
  }

  /** The paths listed in a lane, in order. */
  async expectFiles(lane: string, paths: string[]): Promise<void> {
    await expect(this.lane(lane).locator('.file-row .file-path')).toHaveText(paths)
  }

  /** Answers a prompt dialog: picks or types `value`, then presses `submit`. */
  async answer(title: string, label: string, value: string, submit: string): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: title })
    const field = dialog.getByLabel(label)
    if ((await field.evaluate((el) => el.tagName)) === 'INPUT') await field.fill(value)
    else {
      await field.click()
      await this.page.getByRole('option', { name: value, exact: true }).click()
    }
    await dialog.getByRole('button', { name: submit }).click()
  }

  /** Turns lanes on from the working changes header: base branch, then the first lane's name. */
  async start(base: string, firstLane: string): Promise<void> {
    await this.startButton.click()
    await this.answer('Turn on lanes', 'New lanes start from', base, 'Next')
    await this.answer('Turn on lanes', 'First lane (your uncommitted changes go here)', firstLane, 'Turn on lanes')
    await expect(this.lane(firstLane)).toBeVisible()
  }

  async createLane(name: string): Promise<void> {
    await this.newLaneButton.click()
    const dialog = this.page.getByRole('dialog', { name: 'New lane' })
    await dialog.getByRole('textbox').fill(name)
    await dialog.getByRole('button', { name: 'Create lane' }).click()
    await expect(this.lane(name)).toBeVisible()
  }

  async moveFile(path: string, from: string, to: string): Promise<void> {
    await this.file(from, path).click({ button: 'right' })
    await this.page.getByRole('menuitem', { name: `Move to ${to}`, exact: true }).click()
  }

  async laneMenu(lane: string, item: string): Promise<void> {
    await this.lane(lane).getByRole('button', { name: `${lane} actions` }).click()
    await this.page.getByRole('menuitem', { name: item, exact: true }).click()
  }

  async menu(item: string): Promise<void> {
    await this.menuButton.click()
    await this.page.getByRole('menuitem', { name: item, exact: true }).click()
  }

  async commit(lane: string, message: string): Promise<void> {
    await this.lane(lane).getByLabel(`Commit message for ${lane}`).fill(message)
    await this.lane(lane).getByRole('button', { name: `Commit to ${lane}` }).click()
  }
}
