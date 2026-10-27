import { expect, test } from '../fixtures'

test.describe('toolbar', () => {
  test('Redo puts back a commit that Undo took away', async ({ sillygit, repo }) => {
    repo.commitFile('b.txt', 'b\n', 'Add b')
    await sillygit.openRepository(repo.path)
    const undo = sillygit.toolbarButton('Undo')
    const redo = sillygit.toolbarButton('Redo')
    await expect(redo).toBeDisabled()

    await undo.click()
    await expect(sillygit.graph.row('Add b')).toHaveCount(0)
    await expect(redo).toHaveAttribute('title', /Redo commit “Add b”/)

    await redo.click()
    await expect(sillygit.notice).toContainText('Redo commit')
    await expect(sillygit.graph.rows.first()).toContainText('Add b')
    await expect(redo).toBeDisabled()
  })

  test('Stash and Pop are only enabled when there is something to stash or pop', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    const stash = sillygit.toolbarButton('Stash')
    const pop = sillygit.toolbarButton('Pop')
    await expect(stash).toBeDisabled()
    await expect(pop).toBeDisabled()

    repo.writeFile('hello.txt', 'hello\nchanged\n')
    await expect(stash).toBeEnabled()
    await stash.click()
    await expect(pop).toBeEnabled()
    await expect(stash).toBeDisabled()

    await pop.click()
    await expect(pop).toBeDisabled()
    expect(repo.readFile('hello.txt')).toBe('hello\nchanged\n')
  })

  test('Pull and Push are disabled without a remote', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await expect(sillygit.toolbarButton('Pull')).toBeDisabled()
    await expect(sillygit.toolbarButton('Push')).toBeDisabled()
  })

  test('Branch creates a branch and checks it out', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await sillygit.toolbarButton('Create branch').click()
    const prompt = sillygit.page.getByRole('dialog', { name: 'Create branch' })
    await prompt.getByRole('textbox').fill('topic')
    await prompt.getByRole('button', { name: 'Create branch' }).click()
    await expect(sillygit.branchCrumb).toContainText('topic')
  })

  test('the pull menu rebases and remembers the choice', async ({ sillygit, repo }) => {
    const { FixtureRepo } = await import('../support/fixtureRepo')
    const upstream = new FixtureRepo()
    try {
      repo.git('remote', 'add', 'origin', upstream.path)
      repo.git('fetch', '-q', 'origin')
      repo.git('reset', '-q', '--hard', 'origin/main')
      repo.git('branch', '-q', '--set-upstream-to=origin/main')
      upstream.commitFile('theirs.txt', 'theirs\n', 'Theirs')
      repo.commitFile('mine.txt', 'mine\n', 'Mine')
      await sillygit.openRepository(repo.path)

      await sillygit.pullMenu('Pull (rebase)')

      await expect(sillygit.graph.rows.first()).toContainText('Mine')
      await expect.poll(() => repo.git('log', '--format=%s', '-2').trim().split('\n')).toEqual(['Mine', 'Theirs'])
      await expect(sillygit.toolbarButton('Pull')).toHaveAttribute('title', 'Pull (rebase)')
    } finally {
      upstream.remove()
    }
  })
})

test.describe('Actions', () => {
  test('lists actions alphabetically and checks out a branch from the Checkout sub-list', async ({ sillygit, repo }) => {
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)

    await sillygit.actionsButton.click()
    await expect(sillygit.actions.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'Search for commands and actions (e.g., Open Repo)'
    )
    const labels = await sillygit.actions.locator('.palette-label').allTextContents()
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))

    await sillygit.actions.getByRole('option', { name: 'Checkout' }).click()
    await sillygit.actions.getByRole('option', { name: 'Check out feature' }).click()

    await expect(sillygit.branchCrumb).toContainText('feature')
    await expect(sillygit.actions).toHaveCount(0)
  })

  test('the activity log shows the git commands SillyGit ran', async ({ sillygit, repo }) => {
    repo.addFeatureBranch()
    await sillygit.openRepository(repo.path)
    await sillygit.graph.badge('feature').dblclick()
    await expect(sillygit.branchCrumb).toContainText('feature')

    await sillygit.actionsButton.click()
    await sillygit.actions.getByRole('textbox').fill('activity')
    await sillygit.page.keyboard.press('Enter')

    const log = sillygit.page.getByRole('dialog', { name: 'Activity log' })
    await expect(log).toContainText('git checkout feature')
    await expect(log).not.toContainText('git status')
  })

  test('applies a patch file', async ({ sillygit, repo }) => {
    repo.commitFile('b.txt', 'b\n', 'Add b')
    const patch = repo.git('format-patch', '-1', 'HEAD', '--stdout')
    repo.git('reset', '-q', '--hard', 'HEAD~1')
    const { writeFileSync, mkdtempSync } = await import('fs')
    const { join } = await import('path')
    const { tmpdir } = await import('os')
    const patchFile = join(mkdtempSync(join(tmpdir(), 'sillygit-patch-')), 'add-b.patch')
    writeFileSync(patchFile, patch)
    await sillygit.openRepository(repo.path)
    await sillygit.electronApp.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [path] })) as never
    }, patchFile)

    await sillygit.actionsButton.click()
    await sillygit.actions.getByRole('option', { name: 'Apply patch…' }).click()

    await expect(sillygit.notice).toContainText('Applied add-b.patch')
    expect(repo.readFile('b.txt')).toBe('b\n')
  })
})

// -webkit-app-region is inherited, and on macOS a "drag" region swallows clicks
// to move the window, so a top-bar menu (or the backdrop that closes it) left
// draggable can't be clicked or closed. Playwright's clicks get through anyway,
// so check the computed style instead.
test.describe('top bar menus take clicks instead of dragging the window', () => {
  const dragRegions = (page: import('@playwright/test').Page): Promise<string[]> =>
    page
      .locator('.top-bar .dropdown-backdrop, .top-bar [role="menu"], .top-bar [role="menu"] *')
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const style = el.ownerDocument.defaultView!.getComputedStyle(el) as unknown as Record<string, string>
            return style['-webkit-app-region'] !== 'no-drag'
          })
          .map((el) => el.outerHTML.slice(0, 80))
      )

  test('the pull menu', async ({ sillygit, repo }) => {
    repo.git('remote', 'add', 'origin', repo.path)
    await sillygit.openRepository(repo.path)
    await sillygit.toolbarButton('Pull options').click()
    await expect(sillygit.page.getByRole('menu', { name: 'Pull options' })).toBeVisible()
    expect(await dragRegions(sillygit.page)).toEqual([])

    await sillygit.page.keyboard.press('Escape')
    await expect(sillygit.page.getByRole('menu', { name: 'Pull options' })).toHaveCount(0)
  })

  test('the repository menu', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await sillygit.repositoryCrumb.click()
    await expect(sillygit.page.getByRole('menu', { name: 'Repositories' })).toBeVisible()
    expect(await dragRegions(sillygit.page)).toEqual([])
  })
})
