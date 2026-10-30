import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'
import type { SillyGitApp } from '../pages/SillyGitApp'

// Six commits on top of the fixture; status.txt reads "broken" from Step 4 on.
const STEPS = ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6']

/** Starts a bisect from the graph: Step 6 is bad and Step 1 is good. */
async function startBisect(sillygit: SillyGitApp): Promise<void> {
  await sillygit.graph.row('Step 6').click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: 'Start bisect: this commit is bad' }).click()
  await expect(sillygit.bisect.summary).toContainText('now mark a good commit')
  await sillygit.graph.row('Step 1').click({ button: 'right' })
  await sillygit.page.getByRole('menuitem', { name: 'Bisect: mark this commit good' }).click()
  await expect(sillygit.bisect.summary).toContainText('4 commits left')
}

const isBroken = (repo: FixtureRepo): boolean => repo.git('show', 'HEAD:status.txt').startsWith('broken')

test.describe('guided bisect', () => {
  test.beforeEach(({ repo }) => {
    STEPS.forEach((subject, i) => repo.commitFile('status.txt', `${i >= 3 ? 'broken' : 'ok'}\n${subject}\n`, subject))
  })

  test('marks commits from the bar until the first bad one is found and selected', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    await sillygit.graph.row('Step 6').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Start bisect: this commit is bad' }).click()
    await expect(sillygit.bisect.summary).toContainText('now mark a good commit')
    await expect(sillygit.graph.bisectMark('Step 6')).toHaveText('bad')

    await sillygit.graph.row('Step 1').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Bisect: mark this commit good' }).click()
    await expect(sillygit.bisect.summary).toContainText('4 commits left')
    await expect(sillygit.graph.bisectMark('Step 1')).toHaveText('good')
    await expect(sillygit.bisect.banner.getByRole('button', { name: 'Good' })).toBeEnabled()

    for (let i = 0; i < 5; i++) {
      const summary = await sillygit.bisect.summary.textContent()
      if (summary?.startsWith('Bisect found')) break
      const testing = repo.git('log', '-1', '--format=%s').trim()
      await expect(sillygit.graph.bisectMark(testing)).toHaveText('testing')
      await sillygit.bisect.button(isBroken(repo) ? 'Bad' : 'Good').click()
      await expect(sillygit.bisect.summary).not.toHaveText(summary ?? '')
    }

    await sillygit.bisect.expectFinished()
    await expect(sillygit.bisect.summary).toContainText('Step 4')
    await expect(sillygit.graph.bisectMark('Step 4')).toHaveText('first bad')
    await sillygit.graph.expectSelected('Step 4')

    await sillygit.bisect.button('Reset').click()
    await expect(sillygit.bisect.banner).toHaveCount(0)
    await expect(sillygit.graph.bisectMark('Step 4')).toHaveCount(0)
    expect(repo.git('symbolic-ref', '--short', 'HEAD').trim()).toBe('main')
  })

  test('skip moves on to another commit', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await startBisect(sillygit)

    const skipped = repo.git('log', '-1', '--format=%s').trim()
    await sillygit.bisect.button('Skip').click()
    await expect(sillygit.graph.bisectMark(skipped)).toHaveText('skipped')
    await expect(sillygit.bisect.summary).toContainText('3 commits left')
  })

  test('the commit menu marks any commit while bisecting', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await startBisect(sillygit)

    await sillygit.graph.row('Step 3').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Bisect: mark this commit good' }).click()
    await sillygit.graph.row('Step 4').click({ button: 'right' })
    await expect(sillygit.page.getByRole('menuitem', { name: /Start bisect/ })).toHaveCount(0)
    await sillygit.page.getByRole('menuitem', { name: 'Bisect: mark this commit bad' }).click()

    await sillygit.bisect.expectFinished()
    await sillygit.graph.expectSelected('Step 4')
  })

  test('a command decides each commit with git bisect run', async ({ sillygit, repo }) => {
    test.slow()
    await sillygit.openRepository(repo.path)
    await startBisect(sillygit)

    await sillygit.bisect.runCommand('grep -q ^ok status.txt')

    await expect(sillygit.bisect.summary).toContainText('Bisect found the first bad commit', { timeout: 25_000 })
    await expect(sillygit.bisect.summary).toContainText('Step 4')
    await sillygit.graph.expectSelected('Step 4')
    await expect(sillygit.terminal.runTabs).toHaveCount(1)
  })
})
