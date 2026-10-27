import { expect, test } from '../fixtures'

test.describe('picking up outside changes', () => {
  test('a commit made in another tool shows up without a manual refresh', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    repo.commitFile('outside.txt', 'made elsewhere\n', 'Commit from the command line')

    await expect(sillygit.graph.rows.first()).toContainText('Commit from the command line')
  })

  test('an edited file shows up as an uncommitted change', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    repo.writeFile('hello.txt', 'hello\nchanged\n')

    await expect(sillygit.graph.workingChangesRow()).toBeVisible()
  })
})

test.describe('undo', () => {
  test('undoes a commit and leaves its changes staged', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    repo.writeFile('new.txt', 'new\n')
    await sillygit.graph.workingChangesRow().click()
    await sillygit.details.root.getByRole('button', { name: 'Stage All' }).click()
    await sillygit.details.root.getByRole('textbox', { name: 'Commit message' }).fill('Add new.txt')
    await sillygit.details.root.getByRole('button', { name: /^Commit/ }).click()
    await expect(sillygit.graph.rows.first()).toContainText('Add new.txt')

    const undo = sillygit.page.getByRole('button', { name: 'Undo', exact: true })
    await expect(undo).toHaveAttribute('title', /Undo commit “Add new.txt”/)
    await undo.click()

    await expect(sillygit.notice).toContainText('Undo commit')
    await expect(sillygit.graph.row('Add new.txt')).toHaveCount(0)
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('new.txt')
  })

  test('Cmd/Ctrl+Z undoes a checkout', async ({ sillygit, repo }) => {
    repo.git('branch', 'feature')
    await sillygit.openRepository(repo.path)
    await sillygit.graph.badge('feature').dblclick()
    await expect(sillygit.branchCrumb).toContainText('feature')

    await sillygit.graph.root.click({ position: { x: 5, y: 5 } })
    await sillygit.page.keyboard.press('ControlOrMeta+z')

    await expect(sillygit.branchCrumb).toContainText('main')
  })
})

test('amends the last commit message with nothing staged', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.page.keyboard.press('ControlOrMeta+k')
  await sillygit.page.getByRole('textbox', { name: 'Command' }).fill('amend')
  await sillygit.page.keyboard.press('Enter')

  const message = sillygit.details.root.getByRole('textbox', { name: 'Commit message' })
  await expect(message).toHaveValue('Add hello.txt')
  await message.fill('Add hello.txt, reworded')
  await sillygit.details.root.getByRole('button', { name: /^Amend Commit/ }).click()

  await expect(sillygit.graph.rows.first()).toContainText('Add hello.txt, reworded')
  expect(repo.git('rev-list', '--count', 'HEAD').trim()).toBe('2')
})

test('lists stashes and applies, pops and deletes them', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'first stash\n')
  repo.git('stash', 'push', '-m', 'first')
  repo.writeFile('hello.txt', 'second stash\n')
  repo.git('stash', 'push', '-m', 'second')
  await sillygit.openRepository(repo.path)

  const stashes = sillygit.page.getByRole('list', { name: 'Stashes' })
  await expect(stashes.getByRole('listitem')).toHaveText([/second/, /first/])

  await stashes.getByRole('listitem').filter({ hasText: 'first' }).hover()
  await stashes.getByRole('listitem').filter({ hasText: 'first' }).getByRole('button', { name: 'Apply' }).click()
  await expect.poll(() => repo.readFile('hello.txt')).toBe('first stash\n')
  await expect(stashes.getByRole('listitem')).toHaveCount(2)

  repo.git('checkout', '--', 'hello.txt')
  await stashes.getByRole('listitem').filter({ hasText: 'second' }).hover()
  await stashes.getByRole('listitem').filter({ hasText: 'second' }).getByRole('button', { name: 'Pop' }).click()
  await expect(stashes.getByRole('listitem')).toHaveText([/first/])
  expect(repo.readFile('hello.txt')).toBe('second stash\n')

  sillygit.page.once('dialog', (dialog) => dialog.accept())
  await stashes.getByRole('listitem').filter({ hasText: 'first' }).click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: 'Delete stash' }).click()
  await expect(stashes.getByRole('listitem')).toHaveText(['No stashes'])
})

test('fetches from a remote and shows its new branch', async ({ sillygit, repo }) => {
  const { FixtureRepo } = await import('../support/fixtureRepo')
  const upstream = new FixtureRepo()
  try {
    repo.git('remote', 'add', 'origin', upstream.path)
    await sillygit.openRepository(repo.path)
    upstream.git('checkout', '-q', '-b', 'shared')
    upstream.commitFile('shared.txt', 'shared\n', 'Shared work')

    await sillygit.page.getByRole('button', { name: 'Fetch' }).click()

    await expect(sillygit.graph.badge('origin/shared')).toBeVisible()
  } finally {
    upstream.remove()
  }
})
