import { existsSync } from 'fs'
import { dirname, join } from 'path'
import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater'
import { fetchJson } from './http'
import {
  NO_APP_UPDATE,
  RELEASES_REPO,
  compareVersions,
  manualUpdateReason,
  type AppUpdateStatus
} from '../shared/appUpdate'

// Updates for installed builds (see shared/appUpdate.ts). The state lives
// here and every change goes to `onChange`, which ipc/appUpdate.ts forwards
// to the window.

export interface AppUpdateDeps {
  currentVersion: string
  manualReason: string | null
  /** electron-updater's autoUpdater; only loaded when this install can update in place. */
  loadUpdater: () => Promise<AppUpdater>
  /** The newest release's version on GitHub, for installs that update by hand. */
  latestReleaseVersion: () => Promise<string>
  onChange: (status: AppUpdateStatus) => void
}

function message(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  // electron-updater's errors can carry a whole HTTP response; the first line says enough.
  return text.split('\n')[0].slice(0, 300)
}

export class AppUpdateController {
  private status: AppUpdateStatus
  private updater: Promise<AppUpdater> | null = null

  constructor(private readonly deps: AppUpdateDeps) {
    this.status = { ...NO_APP_UPDATE, supported: true, currentVersion: deps.currentVersion, manualReason: deps.manualReason }
  }

  get current(): AppUpdateStatus {
    return this.status
  }

  private set(patch: Partial<AppUpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.deps.onChange(this.status)
  }

  private getUpdater(): Promise<AppUpdater> {
    this.updater ??= this.deps.loadUpdater().then((updater) => {
      // Ask before fetching a few hundred MB; once it's down, quitting installs it too.
      updater.autoDownload = false
      updater.autoInstallOnAppQuit = true
      updater.on('download-progress', (p: ProgressInfo) => this.set({ phase: 'downloading', percent: p.percent }))
      updater.on('update-downloaded', (info: UpdateInfo) =>
        this.set({ phase: 'ready', percent: 100, latestVersion: info.version, error: null })
      )
      return updater
    })
    return this.updater
  }

  /** Asks GitHub for the newest release. Leaves a download in progress or finished alone. */
  async check(): Promise<AppUpdateStatus> {
    if (this.status.phase === 'downloading' || this.status.phase === 'ready' || this.status.phase === 'checking') {
      return this.status
    }
    const before = this.status.latestVersion
    this.set({ phase: 'checking', error: null })
    try {
      let latest: string | null
      if (this.deps.manualReason) {
        latest = await this.deps.latestReleaseVersion()
      } else {
        const result = await (await this.getUpdater()).checkForUpdates()
        latest = result?.updateInfo.version ?? null
      }
      const newer = latest && compareVersions(latest, this.deps.currentVersion) > 0 ? latest : null
      this.set({ phase: newer ? 'available' : 'idle', latestVersion: newer, checkedAt: Date.now() })
    } catch (err) {
      this.set({ phase: before ? 'available' : 'idle', latestVersion: before, error: message(err) })
    }
    return this.status
  }

  /** Downloads the available update; it installs on restart (or quit). */
  async download(): Promise<AppUpdateStatus> {
    if (this.deps.manualReason) throw new Error(this.deps.manualReason)
    if (this.status.phase === 'ready' || this.status.phase === 'downloading') return this.status
    if (!this.status.latestVersion) throw new Error('There is no update to download.')
    const updater = await this.getUpdater()
    this.set({ phase: 'downloading', percent: 0, error: null })
    try {
      // The updater only downloads what its last check found, so check again first.
      await updater.checkForUpdates()
      await updater.downloadUpdate()
      this.set({ phase: 'ready', percent: 100 })
    } catch (err) {
      this.set({ phase: 'available', percent: null, error: message(err) })
      throw err
    }
    return this.status
  }

  /** Quits and installs a downloaded update, then reopens SillyGit. */
  async install(): Promise<void> {
    if (this.status.phase !== 'ready') throw new Error("The update hasn't finished downloading.")
    const updater = await this.getUpdater()
    // isSilent: no NSIS wizard on Windows; isForceRunAfter: reopen SillyGit afterwards.
    updater.quitAndInstall(true, true)
  }
}

/** Facts about how SillyGit was installed, for manualUpdateReason. */
export function installFacts(execPath: string): Parameters<typeof manualUpdateReason>[0] {
  return {
    platform: process.platform,
    hasWindowsUninstaller: process.platform === 'win32' && existsSync(join(dirname(execPath), 'Uninstall SillyGit.exe')),
    appImage: process.env['APPIMAGE']
  }
}

/** The newest published release's version, from the GitHub API. */
export async function latestReleaseVersion(): Promise<string> {
  const release = await fetchJson<{ tag_name: string }>(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`)
  return release.tag_name.replace(/^v/, '')
}
