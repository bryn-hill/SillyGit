import type { Locator, Page } from '@playwright/test'

/** The branch list on the left. */
export class Sidebar {
  readonly root: Locator
  /** The FAVOURITES group above LOCAL, holding starred branches. */
  readonly favourites: Locator
  /** "N branches can be tidied", under LOCAL. */
  readonly tidyBanner: Locator

  constructor(private readonly page: Page) {
    this.root = page.getByRole('navigation', { name: 'Branches' })
    this.favourites = this.root.getByRole('group', { name: 'Favourite branches' })
    this.tidyBanner = this.root.getByTestId('tidy-banner')
  }

  /** A branch row by the name it shows: the last path segment in the tree, the full name among favourites. */
  branch(name: string): Locator {
    return this.root
      .locator('.branch-row')
      .filter({ has: this.page.locator('.branch-name', { hasText: new RegExp(`^${name}$`) }) })
  }

  /** A branch row by its full name, e.g. "origin/main". */
  branchNamed(fullName: string): Locator {
    return this.root.locator(`[data-branch="${fullName}"]`)
  }

  /** The "hidden" or "solo" tag on a branch the graph leaves out or shows alone. */
  graphTag(fullName: string, kind: 'hidden' | 'solo'): Locator {
    return this.branchNamed(fullName).getByTestId(`branch-tag-${kind}`)
  }

  deletedTag(fullName: string): Locator {
    return this.branchNamed(fullName).getByTestId('branch-tag-deleted')
  }

  staleTag(fullName: string): Locator {
    return this.branchNamed(fullName).getByTestId('branch-tag-stale')
  }

  /** The "conflicts" tag on a branch that would conflict if merged. */
  conflictTag(fullName: string): Locator {
    return this.branchNamed(fullName).getByTestId('branch-tag-conflict')
  }

  /** The card that hovering a "conflicts" tag shows (it's portalled outside the sidebar). */
  get conflictCard(): Locator {
    return this.page.getByTestId('conflict-card')
  }

  /** The ↑ahead ↓behind counts against the upstream. */
  syncCounts(fullName: string): Locator {
    return this.branchNamed(fullName).getByTestId('branch-sync')
  }

  /** The star button on a branch row; it only shows on hover until the branch is starred. */
  async toggleStar(fullName: string): Promise<void> {
    const row = this.branchNamed(fullName).first()
    await row.hover()
    await row.getByRole('button', { name: /favourites$/ }).click()
  }

  /** Opens the REMOTE section, which starts collapsed. */
  async expandRemotes(): Promise<void> {
    await this.root.getByRole('button', { name: 'REMOTE', exact: true }).click()
  }

  /** Right-clicks a branch and picks `item` from its menu. */
  async branchMenu(name: string, item: string | RegExp): Promise<void> {
    await this.branch(name).click({ button: 'right' })
    await this.page.getByRole('menu').getByRole('menuitem', { name: item }).click()
  }
}
