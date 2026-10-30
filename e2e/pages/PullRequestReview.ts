import type { Locator, Page } from '@playwright/test'

/** The pull request screen opened from a Launchpad card. */
export class PullRequestReview {
  readonly root: Locator
  readonly conversationTab: Locator
  readonly filesTab: Locator
  readonly checks: Locator
  readonly fileList: Locator
  readonly diff: Locator
  readonly threads: Locator
  readonly drafts: Locator
  readonly reviewBar: Locator
  readonly summary: Locator
  readonly submitButton: Locator
  readonly banner: Locator
  readonly backButton: Locator
  readonly checkoutButton: Locator

  constructor(readonly page: Page) {
    this.root = page.getByTestId('pr-review')
    this.conversationTab = this.root.getByRole('tab', { name: 'Conversation' })
    this.filesTab = this.root.getByRole('tab', { name: /^Files changed/ })
    this.checks = this.root.getByTestId('pr-checks')
    this.fileList = this.root.getByRole('listbox', { name: 'Changed files' })
    this.diff = this.root.getByTestId('pr-file-diff')
    this.threads = this.root.getByTestId('pr-thread')
    this.drafts = this.root.getByTestId('pr-draft')
    this.reviewBar = this.root.getByTestId('pr-review-bar')
    this.summary = this.reviewBar.getByRole('textbox', { name: 'Review summary' })
    this.submitButton = this.reviewBar.getByRole('button', { name: /^Submit review/ })
    this.banner = this.root.getByRole('status')
    this.backButton = this.root.getByRole('button', { name: 'Back to Launchpad' })
    this.checkoutButton = this.root.getByRole('button', { name: /^Check(ing)? out/ })
  }

  file(path: string): Locator {
    return this.fileList.getByRole('option', { name: path })
  }

  verdict(label: 'Comment' | 'Approve' | 'Request changes'): Locator {
    return this.reviewBar.getByRole('radio', { name: label })
  }

  /** A diff row of the open file, by the side and line a comment on it would sit on. */
  row(side: 'LEFT' | 'RIGHT', line: number): Locator {
    return this.diff.locator(`[data-testid="pr-diff-row"][data-side="${side}"][data-line="${line}"]`)
  }

  /** Drafts a line comment; with `extendFrom`, shift-clicks to cover a range of lines. */
  async commentOnLine(side: 'LEFT' | 'RIGHT', line: number, body: string, extendFrom?: number): Promise<void> {
    if (extendFrom != null) {
      await this.row(side, extendFrom).hover()
      await this.row(side, extendFrom).getByRole('button', { name: /^Comment on line/ }).click()
    }
    await this.row(side, line).hover()
    await this.row(side, line)
      .getByRole('button', { name: /^Comment on line/ })
      .click({ modifiers: extendFrom != null ? ['Shift'] : [] })
    const box = this.diff.getByRole('textbox').last()
    await box.fill(body)
    await this.diff.getByRole('button', { name: 'Add review comment' }).click()
  }
}
