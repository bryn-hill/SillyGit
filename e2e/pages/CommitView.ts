import { expect, type Locator, type Page } from '@playwright/test'

/** The full-screen commit view with a file's diff; its file list is the detail panel beside it. */
export class CommitView {
  readonly root: Locator
  /** The commit's files, listed in the detail panel. */
  readonly files: Locator
  readonly diff: Locator
  /** The scrollable area holding the diff or file content. */
  readonly scroller: Locator
  readonly openFile: Locator
  readonly backButton: Locator
  /** A file the commit didn't change, shown as it was at the commit. */
  readonly treeFile: Locator

  constructor(page: Page) {
    this.root = page.getByRole('region', { name: 'Commit diff' })
    this.diff = this.root.getByTestId('diff')
    this.scroller = this.diff.getByTestId('diff-scroller')
    this.files = page.getByRole('complementary', { name: 'Details' })
    this.openFile = this.files.locator('.file-row[aria-current="true"]')
    this.backButton = this.root.getByTitle('Back to repository view')
    this.treeFile = this.root.getByRole('region', { name: 'File at commit' })
  }

  /** The words highlighted as changed within paired removed/added lines. */
  changedWords(): Locator {
    // Playwright's role list has no 'mark' yet, so match the element itself.
    return this.diff.locator('mark')
  }

  file(path: string): Locator {
    return this.files.locator('.file-row').filter({ hasText: path })
  }

  /** Picks a toolbar option: 'File View', 'Diff View', 'Unified' or 'Side by side'. */
  async show(option: DiffOption): Promise<void> {
    await this.toolbarButton(option).click()
  }

  /** A toolbar button; the layout ones are pressed while their layout shows. */
  toolbarButton(option: DiffOption): Locator {
    return this.diff.getByRole('button', { name: option, exact: true })
  }

  async scrollToRightEdge(): Promise<void> {
    await this.scroller.evaluate((el) => {
      el.scrollLeft = el.scrollWidth
    })
  }

  /** Whether the last character of the code line containing `text` is inside the visible part of the scroller. */
  async isLineEndVisible(text: string): Promise<boolean> {
    return this.scroller.evaluate((el, text) => {
      const code = [...el.querySelectorAll('.line-code')].find((c) => c.textContent?.includes(text))
      if (!code) return false
      const walker = el.ownerDocument.createTreeWalker(code, 4 /* NodeFilter.SHOW_TEXT */)
      let node: typeof walker.currentNode | null = null
      while (walker.nextNode()) if (walker.currentNode.textContent) node = walker.currentNode
      if (!node?.textContent) return false
      const range = el.ownerDocument.createRange()
      range.setStart(node, node.textContent.length - 1)
      range.setEnd(node, node.textContent.length)
      const char = range.getBoundingClientRect()
      const view = el.getBoundingClientRect()
      return char.width > 0 && char.left >= view.left && char.right <= view.left + el.clientWidth
    }, text)
  }

  async back(): Promise<void> {
    await this.backButton.click()
  }

  async expectShowing(path: string, diffContains: string): Promise<void> {
    await expect(this.root).toBeVisible()
    await expect(this.openFile).toHaveText(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await expect(this.diff).toContainText(diffContains)
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0)
  }
}

export type DiffOption = 'File View' | 'Diff View' | 'Unified' | 'Side by side'
