import { expect, test } from '../fixtures'

const pkg = (version: string, react: string): string =>
  JSON.stringify({ name: 'fixture', version, dependencies: { react } }, null, 2) + '\n'

test.describe('commit quick actions', () => {
  test.beforeEach(async ({ repo }) => {
    repo.commitFile('package.json', pkg('0.1.0', '^19.3.0'), 'Add package.json')
  })

  test('bumps the version, stages it and fills in the message', async ({ sillygit, repo }) => {
    repo.writeFile('notes.txt', 'wip\n')
    await sillygit.openRepository(repo.path)
    const page = sillygit.page

    await page.getByRole('button', { name: 'Quick actions ▾' }).click()
    await page.getByRole('menu').getByText('Bump version (0.1.0)').hover()
    await page.getByRole('menuitem', { name: 'Minor → 0.2.0' }).click()

    await expect(page.getByPlaceholder('Commit message')).toHaveValue('chore: bump version to 0.2.0')
    await expect(page.getByRole('button', { name: 'Commit (1)' })).toBeEnabled()
    expect(JSON.parse(repo.readFile('package.json')).version).toBe('0.2.0')
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('package.json')

    await page.getByRole('button', { name: 'Commit (1)' }).click()
    await expect(sillygit.graph.rows.filter({ hasText: 'chore: bump version to 0.2.0' })).toHaveCount(1)
  })

  test('suggests a message for a staged dependency bump', async ({ sillygit, repo }) => {
    repo.writeFile('package.json', pkg('0.1.0', '^19.3.1'))
    repo.git('add', 'package.json')
    await sillygit.openRepository(repo.path)
    const page = sillygit.page

    const suggestion = page.getByRole('button', { name: /^Use chore\(deps\)/ })
    await expect(suggestion).toHaveText('Use chore(deps): bump react from ^19.3.0 to ^19.3.1')
    await suggestion.click()
    await expect(page.getByPlaceholder('Commit message')).toHaveValue('chore(deps): bump react from ^19.3.0 to ^19.3.1')
    await expect(suggestion).toHaveCount(0)

    await sillygit.details.openCommitMenu('Type')
    await page.getByRole('menuitem', { name: 'fix:', exact: true }).click()
    await expect(page.getByPlaceholder('Commit message')).toHaveValue('fix: bump react from ^19.3.0 to ^19.3.1')
  })
})

test('a new pull request gets its title and body from the commits, also on GitHub', async ({ sillygit, repo, electronApp }) => {
  repo.git('checkout', '-q', '-b', 'chore/bump-deps')
  repo.commitFile('a.txt', 'a\n', 'chore(deps): bump react')
  repo.commitFile('b.txt', 'b\n', 'chore(deps): bump vite')
  repo.git('checkout', '-q', 'main')
  repo.addFakeRemote('git@github.com:owner/repo.git', ['main', 'chore/bump-deps'])
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('shell:open-external')
    ipcMain.handle('shell:open-external', (_e, url: string) => {
      ;(globalThis as { openedUrl?: string }).openedUrl = url
      return { ok: true, data: undefined }
    })
  })
  await sillygit.openRepository(repo.path)

  await sillygit.graph.badge('origin/chore/bump-deps').click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: /^Start a pull request/ }).click()
  const dialog = sillygit.createPullRequest
  await expect(dialog.title).toHaveValue('chore(deps): 2 dependency updates')
  await expect(dialog.description).toHaveValue(/^## Commits\n\n- chore\(deps\): bump react \(\w{7}\)\n- chore\(deps\): bump vite/)
  await dialog.openOnGithubButton.click()
  await expect(dialog.root).toBeHidden()

  await expect
    .poll(() => electronApp.evaluate(() => (globalThis as { openedUrl?: string }).openedUrl))
    .toBeTruthy()
  const url = new URL((await electronApp.evaluate(() => (globalThis as { openedUrl?: string }).openedUrl))!)
  expect(url.pathname).toBe('/owner/repo/compare/main...chore/bump-deps')
  expect(url.searchParams.get('title')).toBe('chore(deps): 2 dependency updates')
  expect(url.searchParams.get('body')).toMatch(/^## Commits\n\n- chore\(deps\): bump react \(\w{7}\)\n- chore\(deps\): bump vite/)
})
