import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'

const subjects = (repo: FixtureRepo, ref: string): string[] => repo.git('log', '--topo-order', '--format=%s', ref).trim().split('\n')
const head = (repo: FixtureRepo): string => repo.git('symbolic-ref', '--short', 'HEAD').trim()

/** Sets git-flow up the way `git flow init -d` would, with develop at main. */
function initGitFlow(repo: FixtureRepo): void {
  repo.git('branch', 'develop', 'main')
  repo.git('config', 'gitflow.branch.master', 'main')
  repo.git('config', 'gitflow.branch.develop', 'develop')
  repo.git('config', 'gitflow.prefix.feature', 'feature/')
  repo.git('config', 'gitflow.prefix.release', 'release/')
  repo.git('config', 'gitflow.prefix.hotfix', 'hotfix/')
  repo.git('config', 'gitflow.prefix.versiontag', 'v')
}

test('sets git-flow up from the Actions list', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)

  await sillygit.actionsButton.click()
  await sillygit.actions.getByRole('option', { name: 'Git flow: Set up…' }).click()
  await expect(sillygit.gitFlow.field('Production branch')).toHaveValue('main')
  await expect(sillygit.gitFlow.field('Feature prefix')).toHaveValue('feature/')
  await sillygit.gitFlow.field('Development branch').fill('main')
  await expect(sillygit.gitFlow.setupDialog).toContainText('must be different')
  await sillygit.gitFlow.field('Development branch').fill('develop')
  await sillygit.gitFlow.field('Version tag prefix').fill('v')
  await sillygit.gitFlow.save()

  await expect(sillygit.notice).toContainText('Created develop from main')
  await expect(sillygit.sidebar.branchNamed('develop')).toBeVisible()
  expect(repo.git('config', 'gitflow.branch.develop').trim()).toBe('develop')
  expect(repo.git('config', 'gitflow.prefix.versiontag').trim()).toBe('v')
  expect(head(repo)).toBe('main')
})

test('starts a feature from develop’s branch menu and finishes it from its own', async ({ sillygit, repo }) => {
  initGitFlow(repo)
  await sillygit.openRepository(repo.path)

  await sillygit.sidebar.branchMenu('develop', 'Start feature from develop…')
  await sillygit.gitFlow.answerStart('feature', 'develop', 'login')
  await expect(sillygit.notice).toContainText('Started feature/login.')
  await expect(sillygit.branchCrumb).toContainText('feature/login')

  repo.commitFile('login.txt', 'login\n', 'Add login')
  sillygit.page.on('dialog', (dialog) => dialog.accept())
  await sillygit.sidebar.branchNamed('feature/login').click({ button: 'right' })
  await sillygit.page.getByRole('menu').getByRole('menuitem', { name: 'Finish feature login…' }).click()

  await expect(sillygit.notice).toContainText('Finished feature/login: merged into develop, and deleted it.')
  await expect(sillygit.branchCrumb).toContainText('develop')
  await expect(sillygit.sidebar.branchNamed('feature/login')).toHaveCount(0)
  expect(subjects(repo, 'develop').slice(0, 2)).toEqual(["Merge branch 'feature/login' into develop", 'Add login'])
})

test('finishes a release from the Actions list: merged into main and develop, and tagged', async ({ sillygit, repo }) => {
  initGitFlow(repo)
  repo.git('checkout', '-q', '-b', 'release/1.0.0', 'develop')
  repo.commitFile('VERSION', '1.0.0\n', 'Bump version')
  await sillygit.openRepository(repo.path)

  await sillygit.actionsButton.click()
  await sillygit.actions.getByRole('option', { name: 'Git flow: Finish' }).click()
  await sillygit.actions.getByRole('option', { name: 'Finish release 1.0.0' }).click()
  await sillygit.gitFlow.answerFinish('release', '1.0.0', 'First release')

  await expect(sillygit.notice).toContainText('merged into main and develop, tagged v1.0.0, and deleted it.')
  expect(subjects(repo, 'main')[0]).toBe("Merge branch 'release/1.0.0'")
  expect(subjects(repo, 'develop')[0]).toBe("Merge branch 'release/1.0.0' into develop")
  expect(repo.git('tag', '-l', '--format=%(contents:subject)', 'v1.0.0').trim()).toBe('First release')
})

test('a hotfix starts from main and a conflict finishing it opens the conflict view', async ({ sillygit, repo }) => {
  initGitFlow(repo)
  repo.git('checkout', '-q', 'develop')
  repo.commitFile('hello.txt', 'hello\ndevelop\n', 'Develop edits hello')
  repo.git('checkout', '-q', 'main')
  await sillygit.openRepository(repo.path)

  await sillygit.sidebar.branchMenu('main', 'Start hotfix from main…')
  await sillygit.gitFlow.answerStart('hotfix', 'main', '1.0.1')
  await expect(sillygit.branchCrumb).toContainText('hotfix/1.0.1')
  repo.commitFile('hello.txt', 'hello\nhotfix\n', 'Fix hello')

  await sillygit.actionsButton.click()
  await sillygit.actions.getByRole('textbox').fill('finish hotfix')
  await sillygit.page.keyboard.press('Enter')
  await sillygit.gitFlow.answerFinish('hotfix', '1.0.1')

  await expect(sillygit.notice).toContainText('stopped with conflicts merging into develop')
  await expect(sillygit.conflicts.file('hello.txt')).toBeVisible()
  expect(head(repo)).toBe('develop')
  expect(repo.git('tag', '-l').trim()).toBe('v1.0.1')
})
