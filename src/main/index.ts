import { app, BrowserWindow, net } from 'electron'
import * as accounts from './accounts'
import { setFetch } from './http'
import { setNetworkEnv } from './gitExec'
import { registerTerminalHandlers, killAllTerminals } from './terminal'
import { registerClaudeHandlers, closeAllClaudeChats } from './claude'
import { createWindow, getMainWindow, isE2E } from './window'
import { registerGitHandlers } from './ipc/git'
import { registerMergeHandlers } from './ipc/merging'
import { registerBranchHandlers } from './ipc/branches'
import { registerLaneHandlers } from './ipc/lanes'
import { registerSystemHandlers } from './ipc/system'
import { registerGithubHandlers } from './ipc/github'
import { registerSettingsHandlers } from './ipc/settings'
import { registerAccountHandlers } from './ipc/accounts'
import { registerNotificationHandlers, startPrNotifications } from './ipc/notifications'
import { registerAiHandlers } from './ipc/ai'
import { registerSelfUpdateHandlers, startUpdateChecks } from './ipc/selfUpdate'
import icon from '../../resources/icon.png?asset'

// The main process: starts the window and answers the renderer over IPC.
// Each area's handlers live in ipc/, and the git and hosting work itself in
// the modules beside this one.

function registerIpcHandlers(): void {
  registerSelfUpdateHandlers()
  registerGitHandlers()
  registerMergeHandlers()
  registerBranchHandlers()
  registerLaneHandlers()
  registerSystemHandlers()
  registerGithubHandlers()
  registerSettingsHandlers()
  registerAccountHandlers()
  registerNotificationHandlers()
  registerAiHandlers()
  registerTerminalHandlers(getMainWindow)
  registerClaudeHandlers(getMainWindow)
}

app.whenReady().then(() => {
  // net.fetch goes through the system's proxy settings, like the rest of Chromium.
  setFetch((url, init) => net.fetch(url, init))
  setNetworkEnv(accounts.gitAuthEnv)
  registerIpcHandlers()
  // Packaged macOS builds take the icon from the bundle; dev runs need it set here.
  if (!app.isPackaged) app.dock?.setIcon(icon)
  createWindow()
  if (!isE2E) startPrNotifications()
  // A packaged build has no checkout to update, so don't fetch for one.
  if (!app.isPackaged && (!isE2E || process.env['SILLYGIT_UPDATE_CHECKOUT'])) startUpdateChecks()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllTerminals()
  closeAllClaudeChats()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAllTerminals()
  closeAllClaudeChats()
})

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})
