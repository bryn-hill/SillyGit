import { expect, test } from '../fixtures'
import { stubIpc } from '../support/ipc'
import { chooseOption } from '../pages/Select'

test('pull request notifications can be switched off per kind and altogether', async ({ sillygit, electronApp }) => {
  await stubIpc(electronApp, 'accounts:storage-problem', null)
  await stubIpc(electronApp, 'accounts:list', { ok: true, data: [] })

  const { settings } = sillygit
  await settings.open()
  await expect(settings.notificationsEnabled).toBeChecked()
  await expect(settings.notifications).toContainText('Add a GitHub account above to get them.')
  const comments = settings.notificationKind('Someone comments on my pull request')
  await expect(comments).toBeChecked()

  await comments.uncheck()
  await chooseOption(settings.notificationInterval, 'Every 10 minutes')
  await settings.notificationsEnabled.uncheck()
  await expect(comments).toBeDisabled()
  await expect(settings.testNotificationButton).toBeDisabled()

  // The choices are saved: they come back when Settings is opened again.
  await settings.close()
  await settings.open()
  await expect(settings.notificationsEnabled).not.toBeChecked()
  await expect(comments).not.toBeChecked()
  await expect(settings.notificationKind('My pull request is approved')).toBeChecked()
  await expect(settings.notificationInterval).toHaveText('Every 10 minutes')
})

test('a test notification can be sent from Settings', async ({ sillygit, electronApp }) => {
  await stubIpc(electronApp, 'notifications:test', { ok: true, data: undefined })

  await sillygit.settings.open()
  await sillygit.settings.testNotificationButton.click()
  await expect(sillygit.settings.notifications).toContainText('Sent.')
})
