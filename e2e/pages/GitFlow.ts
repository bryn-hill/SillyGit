import type { Locator, Page } from '@playwright/test'

/** git-flow's setup dialog and the prompts that start and finish its branches. */
export class GitFlow {
  /** The "Set up git-flow" dialog. */
  readonly setupDialog: Locator

  constructor(private readonly page: Page) {
    this.setupDialog = page.getByRole('dialog', { name: 'Set up git-flow' })
  }

  /** A setup dialog field by its label, e.g. "Development branch" or "Version tag prefix". */
  field(label: string): Locator {
    return this.setupDialog.getByLabel(label, { exact: true })
  }

  async save(): Promise<void> {
    await this.setupDialog.getByRole('button', { name: 'Save' }).click()
  }

  /** Names the branch in the "Start <kind> from <base>" prompt and starts it. */
  async answerStart(kind: string, base: string, name: string): Promise<void> {
    const prompt = this.page.getByRole('dialog', { name: `Start ${kind} from ${base}` })
    await prompt.getByRole('textbox').fill(name)
    await prompt.getByRole('button', { name: `Start ${kind}` }).click()
  }

  /** Answers the tag message prompt that finishing a release or hotfix shows. */
  async answerFinish(kind: string, name: string, tagMessage?: string): Promise<void> {
    const prompt = this.page.getByRole('dialog', { name: `Finish ${kind} ${name}` })
    if (tagMessage !== undefined) await prompt.getByRole('textbox').fill(tagMessage)
    await prompt.getByRole('button', { name: `Finish ${kind}` }).click()
  }
}
