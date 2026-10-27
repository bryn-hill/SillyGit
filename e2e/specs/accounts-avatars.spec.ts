import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'

// A 1x1 PNG, standing in for an avatar downloaded from GitHub.
const AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const ACCOUNT = {
  id: 'acct-1',
  provider: 'github',
  host: 'github.com',
  username: 'octocat',
  displayName: 'The Octocat',
  avatar: AVATAR,
  emails: ['e2e@example.com'],
  addedAt: '2026-10-27T00:00:00.000Z'
}

test('commits show initials until an avatar is found', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)

  const node = sillygit.graph.row('Add hello.txt').getByTestId('avatar')
  await expect(node).toHaveText('ET')
  await expect(node).toHaveAttribute('title', 'E2E Tester <e2e@example.com>')
  await expect(sillygit.details.root.getByTestId('avatar')).toHaveText('ET')
})

test('commits show the author avatar in the graph and the side bar', async ({ sillygit, electronApp, repo }) => {
  await stubIpc(electronApp, 'avatars:resolve', { ok: true, data: { 'e2e@example.com': AVATAR } })
  await sillygit.openRepository(repo.path)

  await expect(sillygit.graph.row('Add hello.txt').getByTestId('avatar').locator('img')).toHaveAttribute('src', AVATAR)
  await expect(sillygit.details.root.getByTestId('avatar').locator('img')).toHaveAttribute('src', AVATAR)
})

test('a GitHub token can be added in Settings', async ({ sillygit, electronApp }) => {
  // Keychain and network are stubbed: CI has neither.
  await stubIpc(electronApp, 'accounts:storage-problem', null)
  await stubIpc(electronApp, 'accounts:list', { ok: true, data: [] })
  await stubIpc(electronApp, 'accounts:add', { ok: true, data: ACCOUNT })

  await sillygit.settings.open()
  await sillygit.settings.addAccountButton.click()
  await expect(sillygit.settings.service('GitHub')).toBeChecked()
  await expect(sillygit.settings.hostInput).toHaveValue('github.com')
  await sillygit.settings.addToken('ghp_example')

  await expect(sillygit.settings.account('The Octocat')).toContainText('GitHub · octocat')
  await expect(sillygit.settings.addAccountForm).toHaveCount(0)
})

test('a rejected token shows why', async ({ sillygit, electronApp }) => {
  await stubIpc(electronApp, 'accounts:storage-problem', null)
  await stubIpc(electronApp, 'accounts:list', { ok: true, data: [] })
  await stubIpc(electronApp, 'accounts:add', { ok: false, error: "GitLab didn't accept the token (401 Unauthorized)." })

  await sillygit.settings.open()
  await sillygit.settings.addAccountButton.click()
  await sillygit.settings.service('GitLab').click()
  await expect(sillygit.settings.hostInput).toHaveValue('gitlab.com')
  await sillygit.settings.addToken('glpat-bad')

  await expect(sillygit.settings.addAccountForm.getByRole('alert')).toHaveText(/didn't accept the token/)
})

test('Settings says when tokens cannot be stored securely', async ({ sillygit, electronApp }) => {
  await stubIpc(electronApp, 'accounts:storage-problem', 'No keyring was found (GNOME Keyring or KWallet), so tokens can\'t be stored securely.')
  await stubIpc(electronApp, 'accounts:list', { ok: true, data: [] })

  await sillygit.settings.open()
  await expect(sillygit.settings.accounts).toContainText('No keyring was found')
  await expect(sillygit.settings.addAccountButton).toHaveCount(0)
})
