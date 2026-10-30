import { expect, type Locator, type Page } from '@playwright/test'

/** The first-use walkthrough: a spotlight on one area at a time with a card explaining it. */
export class Tour {
  readonly overlay: Locator
  readonly card: Locator
  readonly spotlight: Locator
  readonly progress: Locator
  readonly nextButton: Locator
  readonly backButton: Locator
  readonly doneButton: Locator
  readonly skipButton: Locator

  constructor(readonly page: Page) {
    this.overlay = page.getByTestId('tour')
    this.card = this.overlay.getByRole('dialog')
    this.spotlight = page.getByTestId('tour-spotlight')
    this.progress = this.card.getByText(/^Step \d+ of \d+$/)
    this.nextButton = this.card.getByRole('button', { name: 'Next' })
    this.backButton = this.card.getByRole('button', { name: 'Back' })
    this.doneButton = this.card.getByRole('button', { name: 'Done' })
    this.skipButton = this.card.getByRole('button', { name: 'Skip tour' })
  }

  /** Expects the step titled `title` to be showing. */
  async expectStep(title: string): Promise<void> {
    await expect(this.card).toHaveAccessibleName(title)
  }

  /** Expects the spotlight to sit around the element whose `data-tour` is `target`. */
  async expectSpotlightOn(target: string): Promise<void> {
    const element = this.page.locator(`[data-tour="${target}"]`)
    await expect
      .poll(async () => {
        const [hole, box] = await Promise.all([this.spotlight.boundingBox(), element.boundingBox()])
        if (!hole || !box) return false
        return hole.x <= box.x && hole.y <= box.y && hole.x + hole.width >= box.x + box.width - 1
      })
      .toBe(true)
  }
}
