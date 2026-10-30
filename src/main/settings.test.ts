import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// settings.ts keeps its file under Electron's userData; point that at a temp folder.
const paths = vi.hoisted(() => ({ appData: '', userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: (name: 'appData' | 'userData') => paths[name] }
}))

import * as settings from './settings'
import { DEFAULT_NOTIFICATION_SETTINGS } from '../shared/notifications'

let root: string
const settingsFile = (): string => join(paths.userData, 'sillygit-settings.json')
const stored = (): Record<string, unknown> => JSON.parse(readFileSync(settingsFile(), 'utf8'))
const seed = (value: unknown): void => writeFileSync(settingsFile(), JSON.stringify(value))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sillygit-settings-'))
  paths.appData = root
  paths.userData = join(root, 'SillyGit')
  mkdirSync(paths.userData)
  vi.stubEnv('ANTHROPIC_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

describe('defaults', () => {
  it('reads defaults when there is no settings file', async () => {
    expect(await settings.getApiKey()).toBeNull()
    expect(await settings.getAutoFetchMinutes()).toBe(settings.DEFAULT_AUTO_FETCH_MINUTES)
    expect(await settings.getShowAvatars()).toBe(true)
    expect(await settings.getNotificationSettings()).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
    expect(await settings.getWorkspaceRepos()).toEqual([])
    expect(await settings.getLastSession()).toEqual({
      lastRepo: null,
      recentRepos: [],
      openTabs: [],
      pinnedTabs: [],
      layout: {}
    })
  })

  it('treats a corrupt settings file as empty', async () => {
    writeFileSync(settingsFile(), '{ not json')
    expect(await settings.getShowAvatars()).toBe(true)
    await settings.setShowAvatars(false)
    expect(stored()).toEqual({ showAvatars: false })
  })
})

describe('legacy settings', () => {
  it('copies gitdesk settings over once and leaves the old file in place', async () => {
    const legacyDir = join(root, 'gitdesk')
    mkdirSync(legacyDir)
    const legacy = join(legacyDir, 'gitdesk-settings.json')
    writeFileSync(legacy, JSON.stringify({ recentRepos: ['/old/repo'], showAvatars: false }))

    expect(await settings.getShowAvatars()).toBe(false)
    expect(stored()).toEqual({ recentRepos: ['/old/repo'], showAvatars: false })
    expect(existsSync(legacy)).toBe(true)

    // From now on the new file wins.
    writeFileSync(legacy, JSON.stringify({ showAvatars: true }))
    expect(await settings.getShowAvatars()).toBe(false)
  })

  it('creates the userData folder for the copy', async () => {
    rmSync(paths.userData, { recursive: true })
    mkdirSync(join(root, 'gitdesk'))
    writeFileSync(join(root, 'gitdesk', 'gitdesk-settings.json'), JSON.stringify({ autoFetchMinutes: 0 }))
    expect(await settings.getAutoFetchMinutes()).toBe(0)
    expect(existsSync(settingsFile())).toBe(true)
  })
})

describe('API key', () => {
  it('prefers the stored key, trimmed, over the environment', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ' from-env ')
    expect(await settings.getApiKey()).toBe('from-env')
    await settings.setApiKey('  stored  ')
    expect(await settings.getApiKey()).toBe('stored')
    expect(await settings.hasStoredApiKey()).toBe(true)
  })

  it('falls back to the environment when the stored key is blank', async () => {
    seed({ anthropicApiKey: '   ' })
    expect(await settings.getApiKey()).toBeNull()
    vi.stubEnv('ANTHROPIC_API_KEY', 'env')
    expect(await settings.getApiKey()).toBe('env')
  })
})

describe('auto fetch', () => {
  it('rounds and clamps the interval', async () => {
    await settings.setAutoFetchMinutes(2.6)
    expect(await settings.getAutoFetchMinutes()).toBe(3)
    await settings.setAutoFetchMinutes(-4)
    expect(await settings.getAutoFetchMinutes()).toBe(0)
  })

  it('ignores a stored value that is not a usable number', async () => {
    seed({ autoFetchMinutes: '10' })
    expect(await settings.getAutoFetchMinutes()).toBe(settings.DEFAULT_AUTO_FETCH_MINUTES)
    seed({ autoFetchMinutes: -1 })
    expect(await settings.getAutoFetchMinutes()).toBe(settings.DEFAULT_AUTO_FETCH_MINUTES)
  })
})

describe('theme', () => {
  it('defaults to dark and stores a known choice', async () => {
    expect(await settings.getThemePreference()).toBe('dark')
    await settings.setThemePreference('light')
    expect(await settings.getThemePreference()).toBe('light')
    expect(stored().theme).toBe('light')
    await settings.setThemePreference('system')
    expect(await settings.getThemePreference()).toBe('system')
  })

  it('ignores a stored value it does not know', async () => {
    seed({ theme: 'neon' })
    expect(await settings.getThemePreference()).toBe('dark')
  })
})

describe('notification and sprint settings', () => {
  it('stores what it was given, normalized', async () => {
    const saved = await settings.setNotificationSettings({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      enabled: false,
      kinds: { ...DEFAULT_NOTIFICATION_SETTINGS.kinds, comment: false }
    })
    expect(saved.enabled).toBe(false)
    expect(await settings.getNotificationSettings()).toEqual(saved)
    expect((stored().notifications as { kinds: { comment: boolean } }).kinds.comment).toBe(false)

    const sprints = await settings.setSprintSettings({ enabled: true, lengthWeeks: 3, startDate: '2026-01-05', startNumber: 7 })
    expect(await settings.getSprintSettings()).toEqual(sprints)
    expect(sprints).toMatchObject({ enabled: true, lengthWeeks: 3, startNumber: 7 })
  })
})

describe('workspace repos', () => {
  it('adds each repo once and removes it again', async () => {
    await settings.addWorkspaceRepo('/a')
    await settings.addWorkspaceRepo('/b')
    expect(await settings.addWorkspaceRepo('/a')).toEqual(['/a', '/b'])
    expect(await settings.removeWorkspaceRepo('/a')).toEqual(['/b'])
    expect(await settings.getWorkspaceRepos()).toEqual(['/b'])
  })
})

describe('session', () => {
  it('keeps the ten most recent repos, newest first, without repeats', async () => {
    for (let i = 1; i <= 12; i++) await settings.recordOpenedRepo(`/repo/${i}`)
    const recent = await settings.recordOpenedRepo('/repo/5')
    expect(recent).toHaveLength(10)
    expect(recent[0]).toBe('/repo/5')
    expect(recent.filter((p) => p === '/repo/5')).toHaveLength(1)
    expect(recent).not.toContain('/repo/1')
    expect((await settings.getLastSession()).lastRepo).toBe('/repo/5')
  })

  it('forgets a recent repo, and the last repo if it was that one', async () => {
    await settings.recordOpenedRepo('/a')
    await settings.recordOpenedRepo('/b')
    expect(await settings.forgetRecentRepo('/a')).toEqual(['/b'])
    expect((await settings.getLastSession()).lastRepo).toBe('/b')
    await settings.forgetRecentRepo('/b')
    expect((await settings.getLastSession()).lastRepo).toBeNull()
  })

  it('only keeps pins for tabs that are open', async () => {
    await settings.saveTabs({ openTabs: ['/a', '/b'], pinnedTabs: ['/b', '/closed'], activeTab: '/a' })
    expect(await settings.getLastSession()).toMatchObject({
      lastRepo: '/a',
      openTabs: ['/a', '/b'],
      pinnedTabs: ['/b']
    })
  })

  it('opens the last repo as a tab for settings saved before tabs existed', async () => {
    seed({ lastRepo: '/only' })
    expect((await settings.getLastSession()).openTabs).toEqual(['/only'])
  })

  it('merges layout changes into what is saved', async () => {
    await settings.saveLayout({ showTerminal: true, terminalHeight: 200 })
    await settings.saveLayout({ terminalHeight: 320 })
    expect((await settings.getLastSession()).layout).toEqual({ showTerminal: true, terminalHeight: 320 })
  })

  it('loses nothing when session saves arrive together', async () => {
    await Promise.all([
      settings.recordOpenedRepo('/a'),
      settings.saveLayout({ showClaude: true }),
      settings.saveTabs({ openTabs: ['/a', '/b'], pinnedTabs: [], activeTab: '/b' }),
      settings.saveLayout({ claudeWidth: 400 }),
      settings.recordOpenedRepo('/b')
    ])
    expect(await settings.getLastSession()).toMatchObject({
      lastRepo: '/b',
      recentRepos: ['/b', '/a'],
      openTabs: ['/a', '/b'],
      layout: { showClaude: true, claudeWidth: 400 }
    })
  })

  it('loses nothing when a settings change lands during a session save', async () => {
    await Promise.all([
      settings.saveLayout({ showTerminal: true }),
      settings.setShowAvatars(false),
      settings.recordOpenedRepo('/a'),
      settings.setAutoFetchMinutes(15),
      settings.addWorkspaceRepo('/w')
    ])
    expect(stored()).toMatchObject({
      layout: { showTerminal: true },
      showAvatars: false,
      recentRepos: ['/a'],
      autoFetchMinutes: 15,
      workspaceRepos: ['/w']
    })
  })

  it('keeps saving after a write fails', async () => {
    // A folder where the file should be makes the write fail.
    mkdirSync(settingsFile())
    await expect(settings.saveLayout({ showTerminal: true })).rejects.toThrow()
    rmSync(settingsFile(), { recursive: true })
    await settings.saveLayout({ showTerminal: false })
    expect(stored()).toEqual({ layout: { showTerminal: false } })
  })
})

describe('run commands', () => {
  it('keeps one run command per repo and clears it when emptied', async () => {
    expect(await settings.getRunCommand('/a')).toBeNull()
    await settings.setRunCommand('/a', '  npm run dev ')
    await settings.setRunCommand('/b', 'make run')
    expect(await settings.getRunCommand('/a')).toBe('npm run dev')
    expect(await settings.getRunCommand('/b')).toBe('make run')
    await settings.setRunCommand('/a', '')
    expect(await settings.getRunCommand('/a')).toBeNull()
    expect(stored().runCommands).toEqual({ '/b': 'make run' })
  })
})
