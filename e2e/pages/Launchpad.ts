import type { Locator, Page } from '@playwright/test'

/** The Launchpad screen: pull requests across the open and workspace repos. */
export class Launchpad {
  readonly root: Locator
  readonly cards: Locator

  constructor(readonly page: Page) {
    this.root = page.getByTestId('launchpad')
    this.cards = this.root.getByTestId('launchpad-card')
  }

  /** A pull request's card, by its title. */
  card(title: string): Locator {
    return this.cards.filter({ hasText: title })
  }

  /** The card's Check out button (named "Check out #<number>"). */
  checkoutButton(number: number): Locator {
    return this.cards.getByRole('button', { name: `Check out #${number}`, exact: true })
  }
}
