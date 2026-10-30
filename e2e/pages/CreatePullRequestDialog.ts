import type { Locator, Page } from '@playwright/test'
import { chooseOption } from './Select'

/** The Create pull request dialog, opened from the branch menu or the Actions list. */
export class CreatePullRequestDialog {
  readonly root: Locator
  readonly head: Locator
  readonly base: Locator
  readonly title: Locator
  readonly description: Locator
  readonly reviewers: Locator
  readonly suggestedReviewers: Locator
  readonly draft: Locator
  /** Says the head isn't fully pushed, with the "Push … first" checkbox. */
  readonly pushNotice: Locator
  readonly pushFirst: Locator
  readonly createButton: Locator
  readonly openOnGithubButton: Locator
  readonly error: Locator

  constructor(readonly page: Page) {
    this.root = page.getByRole('dialog', { name: 'Create pull request' })
    this.head = this.root.getByRole('combobox', { name: 'Merge' })
    this.base = this.root.getByRole('combobox', { name: 'Into' })
    this.title = this.root.getByRole('textbox', { name: 'Title' })
    this.description = this.root.getByRole('textbox', { name: 'Description' })
    this.reviewers = this.root.getByRole('textbox', { name: 'Reviewers' })
    this.suggestedReviewers = this.root.getByRole('group', { name: 'Suggested reviewers' })
    this.draft = this.root.getByRole('checkbox', { name: 'Create as a draft' })
    this.pushNotice = this.root.getByTestId('create-pr-push')
    this.pushFirst = this.pushNotice.getByRole('checkbox')
    this.createButton = this.root.getByRole('button', { name: /^(Push and create|Create) (draft )?pull request$/ })
    this.openOnGithubButton = this.root.getByRole('button', { name: 'Open on GitHub instead' })
    this.error = this.root.getByRole('alert')
  }

  async chooseBase(label: string): Promise<void> {
    await chooseOption(this.base, label)
  }

  async chooseHead(label: string): Promise<void> {
    await chooseOption(this.head, label)
  }

  async addSuggestedReviewer(login: string): Promise<void> {
    await this.suggestedReviewers.getByRole('button', { name: `+ ${login}` }).click()
  }
}
