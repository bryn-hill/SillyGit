import { execFileSync } from 'child_process'
import { rmSync } from 'fs'
import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'

/** Gives `repo` a real bare `origin` with main pushed, and returns a git runner for it. */
function addOrigin(repo: FixtureRepo): (...args: string[]) => string {
  const remote = `${repo.path}.push-origin.git`
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  repo.git('remote', 'add', 'origin', remote)
  repo.git('push', '-q', '-u', 'origin', 'main')
  return (...args) => execFileSync('git', args, { cwd: remote, encoding: 'utf8' }).trim()
}

test.describe('push', () => {
  test.afterEach(({ repo }) => rmSync(`${repo.path}.push-origin.git`, { recursive: true, force: true }))

  test('offers a force push with lease when an amended commit is refused', async ({ sillygit, repo }) => {
    const origin = addOrigin(repo)
    repo.git('commit', '-q', '--amend', '-m', 'Reworded')
    await sillygit.openRepository(repo.path)

    let prompt = ''
    sillygit.page.once('dialog', (dialog) => {
      prompt = dialog.message()
      void dialog.accept()
    })
    await sillygit.toolbarButton('Push').click()

    await expect(sillygit.notice).toContainText('Force pushed to origin/main.')
    expect(prompt).toContain('Force push with lease?')
    expect(origin('log', '-1', '--format=%s', 'main')).toBe('Reworded')
  })

  test('Push to… pushes the branch under another name', async ({ sillygit, repo }) => {
    const origin = addOrigin(repo)
    repo.commitFile('more.txt', 'more\n', 'More')
    await sillygit.openRepository(repo.path)

    await sillygit.pushMenu('Push to…')
    const dialog = sillygit.page.getByRole('dialog', { name: 'Push to' })
    await dialog.getByRole('textbox', { name: 'Branch on the remote' }).fill('review/more')
    await dialog.getByRole('button', { name: 'Push', exact: true }).click()

    await expect(dialog).toHaveCount(0)
    await expect.poll(() => origin('for-each-ref', '--format=%(contents:subject)', 'refs/heads/review/more')).toBe('More')
    expect(repo.git('rev-parse', '--abbrev-ref', 'main@{upstream}').trim()).toBe('origin/main')
  })
})
