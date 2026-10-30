import { execFileSync } from 'node:child_process'
import { expect, test } from '../fixtures'
import { HelpCentre } from '../pages/HelpCentre'

test.describe('single keys in the file lists', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    repo.writeFile('hello.txt', 'hello\nworld\nchanged\n')
    repo.writeFile('notes.txt', 'some notes\n')
    await sillygit.openRepository(repo.path)
    await sillygit.details.listedFile('Unstaged', 'hello.txt').click()
  })

  test('S stages the focused file and moves on to the next, U unstages it', async ({ sillygit }) => {
    await sillygit.page.keyboard.press('s')

    await expect(sillygit.details.listedFile('Staged', 'hello.txt')).toBeVisible()
    await expect(sillygit.details.listedFile('Unstaged', 'notes.txt')).toBeFocused()
    await expect(sillygit.details.listedFile('Unstaged', 'notes.txt')).toHaveAttribute('aria-current', 'true')

    await sillygit.page.keyboard.press('s')
    await expect(sillygit.details.listedFile('Staged', 'notes.txt')).toBeVisible()

    await sillygit.details.listedFile('Staged', 'hello.txt').click()
    await sillygit.page.keyboard.press('u')
    await expect(sillygit.details.listedFile('Unstaged', 'hello.txt')).toBeVisible()
    await expect(sillygit.details.listedFile('Staged', 'notes.txt')).toBeFocused()
  })

  test('D discards the focused file once confirmed', async ({ sillygit, repo }) => {
    sillygit.page.once('dialog', (dialog) => void dialog.accept())
    await sillygit.page.keyboard.press('d')

    await expect.poll(() => repo.readFile('hello.txt')).toBe('hello\nworld\n')
  })
})

test('Cmd+B opens the branch switcher on the Checkout list', async ({ sillygit, repo }) => {
  repo.addFeatureBranch()
  await sillygit.openRepository(repo.path)
  await sillygit.page.keyboard.press('ControlOrMeta+b')

  const palette = sillygit.page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('option')).toHaveText(['Check out feature'])
  await sillygit.page.keyboard.press('Enter')
  await expect(sillygit.branchCrumb).toContainText('feature')
})

test('Cmd+/ opens the keyboard shortcuts', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.graph.root.click()
  await sillygit.page.keyboard.press('ControlOrMeta+/')

  await new HelpCentre(sillygit.page).expectArticle('Keyboard shortcuts')
})

test('Cmd+Shift+U pushes', async ({ sillygit, repo }) => {
  const remote = `${repo.path}.origin.git`
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  repo.git('remote', 'add', 'origin', remote)
  repo.git('push', '-q', '-u', 'origin', 'main')
  repo.commitFile('more.txt', 'more\n', 'Add more.txt')
  await sillygit.openRepository(repo.path)

  await sillygit.page.keyboard.press('ControlOrMeta+Shift+u')

  const head = repo.git('rev-parse', 'HEAD').trim()
  await expect.poll(() => execFileSync('git', ['--git-dir', remote, 'rev-parse', 'main']).toString().trim()).toBe(head)
})
