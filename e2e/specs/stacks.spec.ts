import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'

const subjects = (repo: FixtureRepo, ref: string): string[] => repo.git('log', '--format=%s', ref).trim().split('\n')

/** main <- one <- two, stacked the way SillyGit records it, then main moves on. */
function stackBehindMain(repo: FixtureRepo): void {
  const mainTip = repo.git('rev-parse', 'main').trim()
  repo.git('checkout', '-q', '-b', 'one')
  repo.commitFile('one.txt', 'one\n', 'Add one')
  const oneTip = repo.git('rev-parse', 'one').trim()
  repo.git('checkout', '-q', '-b', 'two')
  repo.commitFile('two.txt', 'two\n', 'Add two')
  repo.git('config', 'branch.one.sillygit-parent', 'main')
  repo.git('config', 'branch.one.sillygit-base', mainTip)
  repo.git('config', 'branch.two.sillygit-parent', 'one')
  repo.git('config', 'branch.two.sillygit-base', oneTip)
  repo.git('checkout', '-q', 'main')
  repo.commitFile('main.txt', 'main\n', 'Main moves on')
  repo.git('checkout', '-q', 'two')
}

test('stacks a new branch on another from the branch menu', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)

  await sillygit.sidebar.branchMenu('main', 'New branch stacked on main…')
  const prompt = sillygit.page.getByRole('dialog', { name: 'New branch stacked on main' })
  await prompt.getByLabel('Branch name').fill('part-1')
  await prompt.getByRole('button', { name: 'Create branch' }).click()

  const stack = sillygit.sidebar.root.getByRole('group', { name: 'Stack part-1' })
  await expect(stack).toContainText('on main')
  await expect(stack.getByRole('list').getByRole('button')).toHaveText([/part-1/])
  expect(repo.git('symbolic-ref', '--short', 'HEAD').trim()).toBe('part-1')
  expect(repo.git('config', 'branch.part-1.sillygit-parent').trim()).toBe('main')
})

test('restacks a stack whose trunk moved on, from the side bar', async ({ sillygit, repo }) => {
  stackBehindMain(repo)
  await sillygit.openRepository(repo.path)

  const stack = sillygit.sidebar.root.getByRole('group', { name: 'Stack one' })
  await expect(stack.getByRole('list').getByRole('button')).toHaveText([/one.*needs restack/, /two/])
  await stack.getByRole('button', { name: 'Restack one' }).click()

  await expect(sillygit.notice).toContainText('Restacked one, two.')
  expect(subjects(repo, 'two')).toEqual(['Add two', 'Add one', 'Main moves on', 'Add hello.txt', 'Initial commit'])
  expect(repo.git('symbolic-ref', '--short', 'HEAD').trim()).toBe('two')
  await expect(stack.getByRole('button', { name: 'Restack one' })).toHaveCount(0)
  await expect(stack).not.toContainText('needs restack')
})

test('the palette restacks the checked-out branch’s stack', async ({ sillygit, repo }) => {
  stackBehindMain(repo)
  await sillygit.openRepository(repo.path)

  await sillygit.page.keyboard.press('ControlOrMeta+k')
  await sillygit.page.getByRole('textbox', { name: 'Command' }).fill('restack')
  const palette = sillygit.page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('option', { selected: true })).toContainText('Restack the one stack')
  await sillygit.page.keyboard.press('Enter')

  await expect(sillygit.notice).toContainText('Restacked one, two.')
  expect(subjects(repo, 'one')).toEqual(['Add one', 'Main moves on', 'Add hello.txt', 'Initial commit'])
})
