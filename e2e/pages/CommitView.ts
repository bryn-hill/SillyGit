import { expect, type Locator, type Page } from "@playwright/test";

/** The full-screen commit view with a file's diff. */
export class CommitView {
  readonly root: Locator;
  readonly diff: Locator;
  /** The scrollable area holding the diff or file content. */
  readonly scroller: Locator;
  readonly openFile: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.root = page.getByRole("region", { name: "Commit diff" });
    this.diff = this.root.getByTestId("diff");
    this.scroller = this.diff.getByTestId("diff-scroller");
    this.openFile = this.root.locator('.file-row[aria-current="true"]');
    this.backButton = this.root.getByTitle("Back to repository view");
  }

  file(path: string): Locator {
    return this.root.locator(".file-row").filter({ hasText: path });
  }

  /** Picks a toolbar option: 'File View', 'Diff View', 'Unified view' or 'Split view'. */
  async show(
    option: "File View" | "Diff View" | "Unified view" | "Split view",
  ): Promise<void> {
    const button = option.endsWith("View")
      ? this.diff.getByRole("button", { name: option })
      : this.diff.getByTitle(option);
    await button.click();
  }

  async scrollToRightEdge(): Promise<void> {
    await this.scroller.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
  }

  /** Whether the last character of the code line containing `text` is inside the visible part of the scroller. */
  async isLineEndVisible(text: string): Promise<boolean> {
    return this.scroller.evaluate((el, text) => {
      const code = [...el.querySelectorAll(".line-code")].find((c) =>
        c.textContent?.includes(text),
      );
      if (!code) return false;
      const walker = el.ownerDocument.createTreeWalker(
        code,
        4 /* NodeFilter.SHOW_TEXT */,
      );
      let node: typeof walker.currentNode | null = null;
      while (walker.nextNode())
        if (walker.currentNode.textContent) node = walker.currentNode;
      if (!node?.textContent) return false;
      const range = el.ownerDocument.createRange();
      range.setStart(node, node.textContent.length - 1);
      range.setEnd(node, node.textContent.length);
      const char = range.getBoundingClientRect();
      const view = el.getBoundingClientRect();
      return (
        char.width > 0 &&
        char.left >= view.left &&
        char.right <= view.left + el.clientWidth
      );
    }, text);
  }

  async back(): Promise<void> {
    await this.backButton.click();
  }

  async expectShowing(path: string, diffContains: string): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.openFile).toHaveText(
      new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    await expect(this.diff).toContainText(diffContains);
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }
}
