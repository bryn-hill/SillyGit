import { expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { ClaudePanel } from './ClaudePanel'
import { CommitGraph } from './CommitGraph'
import { CommitView } from './CommitView'
import { ConflictPanel } from './ConflictPanel'
import { DetailPanel } from './DetailPanel'
import { FileEditor } from './FileEditor'
import { InteractiveRebase } from './InteractiveRebase'
import { Launchpad } from './Launchpad'
import { FileHistory } from './FileHistory'
import { WorkingFileView } from './WorkingFileView'
import { MergeTool } from './MergeTool'
import { PullRequestReview } from './PullRequestReview'
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
  readonly pullRequest: PullRequestReview
  readonly launchpad: Launchpad
  readonly rebase: InteractiveRebase
  readonly fileHistory: FileHistory
  readonly workingFile: WorkingFileView

  readonly emptyState: Locator
  readonly openRepositoryButton: Locator
  readonly repositoryCrumb: Locator
  readonly branchCrumb: Locator
  readonly notice: Locator
  readonly claudeButton: Locator
  readonly terminalButton: Locator
  /** The GitKraken-style toolbar: Undo, Redo, Pull, Push, Branch, Stash, Pop, Terminal. */
  readonly toolbar: Locator
  readonly topBar: Locator
  /** The ⋯ button that holds Redo, Stash and Pop once the window is too narrow for them. */
  readonly moreButton: Locator
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
    this.pullRequest = new PullRequestReview(page)
    this.launchpad = new Launchpad(page)
    this.rebase = new InteractiveRebase(page)
    this.fileHistory = new FileHistory(page)
    this.workingFile = new WorkingFileView(page)

    this.emptyState = page.getByText('No repository open.')
    this.openRepositoryButton = page.getByRole('button', { name: 'Open Repository', exact: true })
    this.repositoryCrumb = page.getByRole('button', { name: /^Repository/ })
    this.branchCrumb = page.getByRole('button', { name: /^Branch/ })
    this.notice = page.locator('.notice-banner')
    this.claudeButton = page.getByTitle('Claude Code (Ctrl+Esc)')
    this.terminalButton = page.getByTitle('Toggle terminal (Ctrl+`)')
    this.toolbar = page.getByRole('toolbar', { name: 'Git actions' })
    this.topBar = page.getByTestId('top-bar')
    this.moreButton = this.toolbarButton('More actions')
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

  /** Opens the Run button's menu and picks `item`, e.g. "Run in isolation". */
  async runMenu(item: string): Promise<void> {
    await this.toolbarButton('Run options').click()
    await this.page.getByRole('menu', { name: 'Run options' }).getByText(item, { exact: true }).click()
  }

  /** Answers the "Run command" prompt that the first Run (or Edit run command…) shows. */
  async setRunCommand(command: string): Promise<void> {
    const prompt = this.page.getByRole('dialog', { name: 'Run command' })
    await prompt.getByRole('textbox').fill(command)
    await prompt.getByRole('button', { name: 'Save' }).click()
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

  /** Resizes the window's content area, like dragging it to half the screen. */
  async resizeWindow(width: number, height: number): Promise<void> {
    await this.electronApp.evaluate(
      ({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h),
      [width, height]
    )
    await expect.poll(() => this.page.evaluate<number>('window.innerWidth')).toBe(width)
  }

  async toggleClaude(): Promise<void> {
    await this.claudeButton.click()
  }

  async toggleTerminal(): Promise<void> {
    await this.terminalButton.click()
  }
}
