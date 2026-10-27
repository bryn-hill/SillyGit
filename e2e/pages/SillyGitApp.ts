import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { ClaudePanel } from './ClaudePanel'
import { CommitGraph } from './CommitGraph'
import { CommitView } from './CommitView'
import { ConflictPanel } from './ConflictPanel'
import { DetailPanel } from './DetailPanel'
import { FileEditor } from './FileEditor'
import { MergeTool } from './MergeTool'
import { RepoTabs } from './RepoTabs'
import { SettingsDialog } from './SettingsDialog'
import { Sidebar } from './Sidebar'
import { TerminalPanel } from './TerminalPanel'

/** The main window. Entry point for the page objects of each area. */
export class SillyGitApp {
  readonly graph: CommitGraph
  readonly details: DetailPanel
  readonly commitView: CommitView
  readonly claude: ClaudePanel
  readonly terminal: TerminalPanel
  readonly sidebar: Sidebar
  readonly conflicts: ConflictPanel
  readonly mergeTool: MergeTool
  readonly settings: SettingsDialog
  readonly tabs: RepoTabs
  readonly editor: FileEditor

  readonly emptyState: Locator
  readonly openRepositoryButton: Locator
  readonly repositoryCrumb: Locator
  readonly branchCrumb: Locator
  readonly notice: Locator
  readonly claudeButton: Locator
  readonly terminalButton: Locator
  /** The GitKraken-style toolbar: Undo, Redo, Pull, Push, Branch, Stash, Pop, Terminal. */
  readonly toolbar: Locator
  readonly actionsButton: Locator
  /** The Actions dropdown opened by actionsButton. */
  readonly actions: Locator

  constructor(
    readonly electronApp: ElectronApplication,
    readonly page: Page
  ) {
    this.graph = new CommitGraph(page)
    this.details = new DetailPanel(page)
    this.commitView = new CommitView(page)
    this.claude = new ClaudePanel(page)
    this.terminal = new TerminalPanel(page)
    this.sidebar = new Sidebar(page)
    this.conflicts = new ConflictPanel(page)
    this.mergeTool = new MergeTool(page)
    this.settings = new SettingsDialog(page)
    this.tabs = new RepoTabs(page)
    this.editor = new FileEditor(page)

    this.emptyState = page.getByText('No repository open.')
    this.openRepositoryButton = page.getByRole('button', { name: 'Open Repository', exact: true })
    this.repositoryCrumb = page.getByRole('button', { name: /^Repository/ })
    this.branchCrumb = page.getByRole('button', { name: /^Branch/ })
    this.notice = page.locator('.notice-banner')
    this.claudeButton = page.getByTitle('Claude Code (Ctrl+Esc)')
    this.terminalButton = page.getByTitle('Toggle terminal (Ctrl+`)')
    this.toolbar = page.getByRole('toolbar', { name: 'Git actions' })
    this.actionsButton = page.getByRole('button', { name: 'Actions', exact: true })
    this.actions = page.getByRole('dialog', { name: 'Actions' })
  }

  /** A toolbar button by its accessible name, e.g. "Undo" or "Create branch". */
  toolbarButton(name: string): Locator {
    return this.toolbar.getByRole('button', { name, exact: true })
  }

  /** Opens the Pull button's menu and picks `item`, e.g. "Fetch" or "Pull (rebase)". */
  async pullMenu(item: string): Promise<void> {
    await this.toolbarButton('Pull options').click()
    await this.page.getByRole('menu', { name: 'Pull options' }).getByText(item, { exact: true }).click()
  }

  /** Opens `repoPath` through the "Open Repository" button, with the folder picker stubbed. */
  async openRepository(repoPath: string): Promise<void> {
    await this.electronApp.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [path] })) as never
    }, repoPath)
    await this.openRepositoryButton.click()
    await expect(this.graph.rows.first()).toBeVisible()
  }

  /** Opens `repoPath` in a new tab through the + button, with the folder picker stubbed. */
  async openRepositoryInNewTab(repoPath: string): Promise<void> {
    await this.electronApp.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [path] })) as never
    }, repoPath)
    await this.tabs.newTabButton.click()
    await expect(this.repositoryCrumb).toContainText(repoPath.split('/').pop()!)
  }

  /** Opens `repoPath` through the repository crumb's menu, with the folder picker stubbed. */
  async openRepositoryFromMenu(repoPath: string): Promise<void> {
    await this.electronApp.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [path] })) as never
    }, repoPath)
    await this.repositoryCrumb.click()
    await this.page.getByRole('menuitem', { name: 'Open repository…' }).click()
    await expect(this.repositoryCrumb).toContainText(repoPath.split('/').pop()!)
  }

  async toggleClaude(): Promise<void> {
    await this.claudeButton.click()
  }

  async toggleTerminal(): Promise<void> {
    await this.terminalButton.click()
  }
}
