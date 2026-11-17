import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { AppUpdater } from 'electron-updater'
import { AppUpdateController, type AppUpdateDeps } from './appUpdate'
import type { AppUpdateStatus } from '../shared/appUpdate'

/** A stand-in for electron-updater's autoUpdater that offers `latest`. */
function fakeUpdater(latest: string) {
  const emitter = new EventEmitter()
  const updater = Object.assign(emitter, {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(async () => ({ updateInfo: { version: latest } })),
    downloadUpdate: vi.fn(async () => {
      emitter.emit('download-progress', { percent: 50 })
      emitter.emit('update-downloaded', { version: latest })
      return []
    }),
    quitAndInstall: vi.fn()
  })
  return updater
}

function setup(over: Partial<AppUpdateDeps> & { latest?: string } = {}) {
  const updater = fakeUpdater(over.latest ?? '0.3.0')
  const changes: AppUpdateStatus[] = []
  const controller = new AppUpdateController({
    currentVersion: '0.2.1',
    manualReason: null,
    loadUpdater: async () => updater as unknown as AppUpdater,
    latestReleaseVersion: async () => over.latest ?? '0.3.0',
    onChange: (s) => changes.push(s),
    ...over
  })
  return { controller, updater, changes }
}

describe('AppUpdateController', () => {
  it('finds a newer release without downloading it', async () => {
    const { controller, updater } = setup()
    const status = await controller.check()
    expect(status).toMatchObject({ phase: 'available', latestVersion: '0.3.0', error: null })
    expect(status.checkedAt).not.toBeNull()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('says it is up to date when the release is not newer', async () => {
    const { controller } = setup({ latest: '0.2.1' })
    expect(await controller.check()).toMatchObject({ phase: 'idle', latestVersion: null })
  })

  it('downloads, reports progress, then installs on restart', async () => {
    const { controller, updater, changes } = setup()
    await controller.check()
    expect(await controller.download()).toMatchObject({ phase: 'ready', percent: 100 })
    expect(changes.some((s) => s.phase === 'downloading' && s.percent === 50)).toBe(true)
    await controller.install()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('keeps what it knew when a check fails', async () => {
    const { controller, updater } = setup()
    await controller.check()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline\nlots of response body'))
    expect(await controller.check()).toMatchObject({ phase: 'available', latestVersion: '0.3.0', error: 'offline' })
  })

  it('goes back to available when a download fails', async () => {
    const { controller, updater } = setup()
    await controller.check()
    updater.downloadUpdate.mockRejectedValueOnce(new Error('signature mismatch'))
    await expect(controller.download()).rejects.toThrow('signature mismatch')
    expect(controller.current).toMatchObject({ phase: 'available', error: 'signature mismatch' })
  })

  it('only checks the GitHub API for installs that update by hand', async () => {
    const loadUpdater = vi.fn()
    const { controller } = setup({ manualReason: 'unzipped', loadUpdater })
    expect(await controller.check()).toMatchObject({ phase: 'available', latestVersion: '0.3.0' })
    expect(loadUpdater).not.toHaveBeenCalled()
    await expect(controller.download()).rejects.toThrow('unzipped')
  })

  it('refuses to install before the download finishes', async () => {
    const { controller } = setup()
    await expect(controller.install()).rejects.toThrow(/finished downloading/)
  })
})
