import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { ClaudePanel } from './ClaudePanel'
import { CommitGraph } from './CommitGraph'
import { CommitView } from './CommitView'
import { DetailPanel } from './DetailPanel'
import { TerminalPanel } from './TerminalPanel'

/** The main window. Entry point for the page objects of each area. */
export class SillyGitApp {
  readonly graph: CommitGraph
  readonly details: DetailPanel
  readonly commitView: CommitView
  readonly claude: ClaudePanel
  readonly terminal: TerminalPanel

  readonly emptyState: Locator
  readonly openRepositoryButton: Locator
  readonly repositoryCrumb: Locator
  readonly branchCrumb: Locator
  readonly claudeButton: Locator
  readonly terminalButton: Locator

  constructor(
    readonly electronApp: ElectronApplication,
    readonly page: Page
  ) {
    this.graph = new CommitGraph(page)
    this.details = new DetailPanel(page)
    this.commitView = new CommitView(page)
    this.claude = new ClaudePanel(page)
    this.terminal = new TerminalPanel(page)

    this.emptyState = page.getByText('No repository open.')
    this.openRepositoryButton = page.getByRole('button', { name: 'Open Repository', exact: true })
    this.repositoryCrumb = page.getByRole('button', { name: /^Repository/ })
    this.branchCrumb = page.getByRole('button', { name: /^Branch/ })
    this.claudeButton = page.getByTitle('Claude Code (Ctrl+Esc)')
    this.terminalButton = page.getByTitle('Toggle terminal (Ctrl+`)')
  }

  /** Opens `repoPath` through the "Open Repository" button, with the folder picker stubbed. */
  async openRepository(repoPath: string): Promise<void> {
    await this.electronApp.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [path] })) as never
    }, repoPath)
    await this.openRepositoryButton.click()
    await expect(this.graph.rows.first()).toBeVisible()
  }

  async toggleClaude(): Promise<void> {
    await this.claudeButton.click()
  }

  async toggleTerminal(): Promise<void> {
    await this.terminalButton.click()
  }
}
