import { execFileSync } from 'node:child_process'
import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'

/** Commits a file as someone else, so they're suggested as a co-author. */
function commitAs(repo: FixtureRepo, name: string, email: string, file: string): void {
  repo.writeFile(file, `${name}\n`)
  repo.git('add', file)
  repo.git('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '--no-gpg-sign', '--author', `${name} <${email}>`, '-m', `By ${name}`)
}

test.describe('co-authors', () => {
  test.beforeEach(({ repo }) => {
    commitAs(repo, 'Grace Hopper', 'grace@example.com', 'grace.txt')
    commitAs(repo, 'Linus Torvalds', 'linus@example.com', 'linus.txt')
  })

  test('picks co-authors from the repo history and commits them as trailers', async ({ sillygit, repo }) => {
    repo.writeFile('new.txt', 'new\n')
    repo.git('add', 'new.txt')
    await sillygit.openRepository(repo.path)
    const details = sillygit.details
    await details.commitMessage.fill('Add new.txt')

    await details.searchCoAuthors('grace')
    await expect(details.coAuthorPicker.getByRole('option')).toHaveCount(1)
    await details.coAuthorOption('Grace Hopper').click()
    await expect(details.coAuthorOption('Grace Hopper')).toHaveAttribute('aria-selected', 'true')
    // Someone new, typed as Name <email>, picked with Enter.
    await details.coAuthorPicker.getByRole('combobox').fill('Ada Lovelace <ada@example.com>')
    await sillygit.page.keyboard.press('Enter')
    await details.closeCoAuthors()

    await expect(details.coAuthorChips).toHaveText([/Grace Hopper/, /Ada Lovelace/])
    await expect(details.commitMessage).toHaveValue(
      'Add new.txt\n\nCo-authored-by: Grace Hopper <grace@example.com>\nCo-authored-by: Ada Lovelace <ada@example.com>'
    )
    await details.root.getByRole('button', { name: /^Commit/ }).click()
    await expect(sillygit.graph.rows.first()).toContainText('Add new.txt')

    expect(repo.git('log', '-1', '--format=%(trailers:key=Co-authored-by,valueonly)').trim().split('\n')).toEqual([
      'Grace Hopper <grace@example.com>',
      'Ada Lovelace <ada@example.com>'
    ])
  })

  test("doesn't suggest the current user, and a chip removes its trailer", async ({ sillygit, repo }) => {
    repo.git('config', 'user.email', 'e2e@example.com')
    repo.writeFile('new.txt', 'new\n')
    repo.git('add', 'new.txt')
    await sillygit.openRepository(repo.path)
    const details = sillygit.details

    await details.searchCoAuthors('')
    await expect(details.coAuthorPicker.getByRole('option')).toHaveText([/Grace Hopper/, /Linus Torvalds/])
    await details.coAuthorOption('Linus Torvalds').click()
    await details.closeCoAuthors()
    // Trailers alone aren't a message to commit with.
    await expect(details.root.getByRole('button', { name: /^Commit/ })).toBeDisabled()

    await details.removeCoAuthor('Linus Torvalds')
    await expect(details.coAuthorChips).toHaveCount(0)
    await expect(details.commitMessage).toHaveValue('')
  })

  test("shows a commit's co-authors with avatars, not as trailer text", async ({ sillygit, repo }) => {
    repo.writeFile('pair.txt', 'pair\n')
    repo.git('add', 'pair.txt')
    repo.git('commit', '-q', '--no-gpg-sign', '-m', 'Pair on it\n\nCo-authored-by: Grace Hopper <grace@example.com>')
    await sillygit.openRepository(repo.path)

    // The checked-out commit is selected on open.
    await sillygit.details.expectCommit('Pair on it')
    await expect(sillygit.details.commitCoAuthors).toHaveText([/Grace Hopper/])
    await expect(sillygit.details.commitCoAuthors.getByTestId('avatar')).toHaveAttribute('data-email', 'grace@example.com')
    await expect(sillygit.details.root.locator('.commit-body')).toHaveCount(0)
  })
})

test.describe('signature badge', () => {
  test('an unsigned commit says so', async ({ sillygit, repo }) => {
    repo.git('commit', '-q', '--allow-empty', '--no-gpg-sign', '-m', 'Not signed')
    await sillygit.openRepository(repo.path)

    await sillygit.details.expectCommit('Not signed')
    await expect(sillygit.details.signatureBadge).toHaveText('Unsigned')
  })

  test('a signature git cannot check is unverified', async ({ sillygit, repo }) => {
    // An SSH signature header nobody can check (no allowed signers, and not a real signature).
    const tree = repo.git('rev-parse', 'HEAD^{tree}').trim()
    const parent = repo.git('rev-parse', 'HEAD').trim()
    const body = [
      `tree ${tree}`,
      `parent ${parent}`,
      'author E2E Tester <e2e@example.com> 1700000000 +0000',
      'committer E2E Tester <e2e@example.com> 1700000000 +0000',
      'gpgsig -----BEGIN SSH SIGNATURE-----',
      ' U1NIU0lH',
      ' -----END SSH SIGNATURE-----',
      '',
      'Signed elsewhere',
      ''
    ].join('\n')
    const hash = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: repo.path, input: body, encoding: 'utf8' }).trim()
    repo.git('reset', '-q', '--hard', hash)
    await sillygit.openRepository(repo.path)

    await sillygit.details.expectCommit('Signed elsewhere')
    await expect(sillygit.details.signatureBadge).toHaveText('Unverified')
    await expect(sillygit.details.signatureBadge).toHaveAttribute('title', /Signed/)
  })
})
