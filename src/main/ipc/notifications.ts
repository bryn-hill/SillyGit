import { app, ipcMain, Notification, shell } from 'electron'
import { join } from 'path'
import * as settings from '../settings'
import * as accounts from '../accounts'
import { remoteLocations } from '../hosting'
import { PrNotifier, type ShownNotification } from '../prNotifications'
import { getMainWindow } from '../window'
import type { NotificationSettings } from '../../shared/notifications'
import icon from '../../../resources/icon.png?asset'
import { wrap } from './wrap'

let prNotifier: PrNotifier | null = null

// Electron drops a notification's click handler if the object is garbage
// collected while it's still on screen, so each one is held until it goes.
const shownNotifications = new Set<Notification>()

function showNotification({ title, body, url }: ShownNotification): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title, body, icon })
  shownNotifications.add(notification)
  notification.on('click', () => {
    shownNotifications.delete(notification)
    const mainWindow = getMainWindow()
    if (url?.startsWith('https://')) void shell.openExternal(url)
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  notification.on('close', () => shownNotifications.delete(notification))
  notification.show()
}

/** GitHub repositories (owner/name) open in SillyGit whose remote is on `host`. */
async function watchedGithubRepos(host: string): Promise<string[]> {
  const [workspace, session] = await Promise.all([settings.getWorkspaceRepos(), settings.getLastSession()])
  const paths = [...new Set([...workspace, ...session.recentRepos])]
  const slugs: string[] = []
  for (const repoPath of paths) {
    for (const loc of await remoteLocations(repoPath)) {
      if (loc.host === host && loc.path.split('/').length === 2) slugs.push(loc.path)
    }
  }
  return slugs
}

/** Starts polling GitHub for pull request activity to notify about. */
export function startPrNotifications(): void {
  prNotifier = new PrNotifier({
    settings: () => settings.getNotificationSettings(),
    accounts: () => accounts.accountsWithCredentials('github'),
    watchedRepos: watchedGithubRepos,
    show: showNotification,
    statePath: join(app.getPath('userData'), 'sillygit-notifications.json')
  })
  void prNotifier.restart()
}

/** Picks up changed settings or accounts; does nothing when notifications never started (e2e runs). */
export function restartPrNotifications(): Promise<void> | undefined {
  return prNotifier?.restart()
}

/** Pull request notification settings and the Send test notification button. */
export function registerNotificationHandlers(): void {
  ipcMain.handle('notifications:get-settings', () => settings.getNotificationSettings())

  ipcMain.handle('notifications:set-settings', (_e, next: NotificationSettings) =>
    wrap(async () => {
      const saved = await settings.setNotificationSettings(next)
      await restartPrNotifications()
      return saved
    })
  )

  ipcMain.handle('notifications:test', () =>
    wrap(async () => {
      if (!Notification.isSupported()) throw new Error('This system doesn\'t support desktop notifications.')
      showNotification({
        title: 'SillyGit notifications are working',
        body: 'You\'ll see pull request updates like this one.',
        url: null
      })
    })
  )
}
