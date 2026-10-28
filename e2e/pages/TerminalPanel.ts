import type { Locator, Page } from "@playwright/test";

export class TerminalPanel {
  readonly root: Locator;
  readonly tabs: Locator;
  readonly newTabButton: Locator;
  /** Tabs running the Run button's command. */
  readonly runTabs: Locator;
  readonly input: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByRole("region", { name: "Terminal" });
    this.tabs = this.root.getByTestId("terminal-tab");
    this.runTabs = this.root.getByTestId("run-tab");
    this.newTabButton = this.root.getByTitle("New terminal");
    // xterm's hidden textarea, in the active tab.
    this.input = this.root
      .locator(".terminal-instance:visible")
      .getByRole("textbox", { name: "Terminal input" });
  }

  /** Types a command into the active shell and presses Enter. */
  async run(command: string): Promise<void> {
    await this.input.focus();
    await this.page.keyboard.type(command);
    await this.page.keyboard.press("Enter");
  }
}
