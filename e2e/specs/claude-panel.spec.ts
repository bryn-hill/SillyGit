import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'

test.beforeEach(async ({ sillygit, electronApp, repo }) => {
  // Opening a chat would start a real Claude Code session, which needs a
  // login and spends usage. Hand back a fake chat id instead.
  await stubIpc(electronApp, 'claude:start', { ok: true, data: -1 })
  await sillygit.openRepository(repo.path)
})

test('the spark button opens the panel with a new chat', async ({ sillygit }) => {
  await sillygit.claude.expectClosed()

  await sillygit.toggleClaude()

  await sillygit.claude.expectOpen()
  await expect(sillygit.claude.tabs).toHaveCount(1)
  await expect(sillygit.claude.emptyState).toBeVisible()
})

test('the close button hides the panel', async ({ sillygit }) => {
  await sillygit.toggleClaude()
  await sillygit.claude.close()

  await sillygit.claude.expectClosed()
})

test('Ctrl+Esc toggles the panel', async ({ sillygit }) => {
  await sillygit.page.keyboard.press('Control+Escape')
  await sillygit.claude.expectOpen()

  await sillygit.page.keyboard.press('Control+Escape')
  await sillygit.claude.expectClosed()
})
