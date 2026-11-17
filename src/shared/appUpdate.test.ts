import { describe, expect, it } from 'vitest'
import { NO_APP_UPDATE, appUpdateTitle, compareVersions, hasAppUpdate, manualUpdateReason } from './appUpdate'

describe('compareVersions', () => {
  it('orders by major, minor and patch', () => {
    expect(compareVersions('0.3.0', '0.2.1')).toBeGreaterThan(0)
    expect(compareVersions('0.2.1', '0.2.10')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('v0.2.1', '0.2.1')).toBe(0)
  })

  it('puts a prerelease before its release', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0)
  })
})

describe('manualUpdateReason', () => {
  const facts = { hasWindowsUninstaller: false, appImage: undefined }
  it('lets macOS and the Windows installer update in place', () => {
    expect(manualUpdateReason({ ...facts, platform: 'darwin' })).toBeNull()
    expect(manualUpdateReason({ ...facts, platform: 'win32', hasWindowsUninstaller: true })).toBeNull()
    expect(manualUpdateReason({ ...facts, platform: 'linux', appImage: '/x/SillyGit.AppImage' })).toBeNull()
  })

  it('sends the Windows zip and other Linux builds to the download page', () => {
    expect(manualUpdateReason({ ...facts, platform: 'win32' })).toMatch(/unzipped/)
    expect(manualUpdateReason({ ...facts, platform: 'linux' })).toMatch(/Download/)
  })
})

describe('the Update button', () => {
  const base = { ...NO_APP_UPDATE, supported: true, currentVersion: '0.2.1' }
  it('only lights up when a newer release is known', () => {
    expect(hasAppUpdate(base)).toBe(false)
    expect(hasAppUpdate({ ...base, phase: 'available', latestVersion: '0.3.0' })).toBe(true)
    expect(hasAppUpdate({ ...NO_APP_UPDATE, latestVersion: '0.3.0' })).toBe(false)
  })

  it('says what it would do', () => {
    expect(appUpdateTitle(base)).toMatch(/0\.2\.1 is up to date/)
    expect(appUpdateTitle({ ...base, phase: 'available', latestVersion: '0.3.0' })).toMatch(/0\.3\.0 is out/)
    expect(appUpdateTitle({ ...base, phase: 'downloading', latestVersion: '0.3.0', percent: 41.6 })).toMatch(/42%/)
    expect(appUpdateTitle({ ...base, phase: 'ready', latestVersion: '0.3.0' })).toMatch(/Restart/)
  })
})
