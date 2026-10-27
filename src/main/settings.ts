import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import type { SavedLayout } from '../shared/types'
import { normalizeNotificationSettings, type NotificationSettings } from '../shared/notifications'

interface StoredSettings {
  anthropicApiKey?: string
  workspaceRepos?: string[]
  lastRepo?: string | null
  recentRepos?: string[]
  layout?: Partial<SavedLayout>
  /** Minutes between background fetches; 0 turns them off. */
  autoFetchMinutes?: number
  /** Look up author avatars online (GitHub, GitLab, Gravatar); off shows initials only. */
  showAvatars?: boolean
  /** Desktop notifications about pull requests. */
  notifications?: Partial<NotificationSettings>
}

const MAX_RECENT_REPOS = 10

function settingsPath(): string {
  return join(app.getPath('userData'), 'sillygit-settings.json')
}

// Where settings lived before the app was renamed from gitdesk to SillyGit
// (userData was <appData>/gitdesk). Copied over once, left in place.
function legacySettingsPath(): string {
  return join(app.getPath('appData'), 'gitdesk', 'gitdesk-settings.json')
}

async function readSettings(): Promise<StoredSettings> {
  let raw: string
  try {
    raw = await fs.readFile(settingsPath(), 'utf-8')
  } catch {
    try {
      raw = await fs.readFile(legacySettingsPath(), 'utf-8')
      await fs.mkdir(app.getPath('userData'), { recursive: true })
      await fs.writeFile(settingsPath(), raw, 'utf-8')
    } catch {
      return {}
    }
  }
  try {
    return JSON.parse(raw) as StoredSettings
  } catch {
    return {}
  }
}

export async function getApiKey(): Promise<string | null> {
  const stored = await readSettings()
  return stored.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null
}

export async function setApiKey(key: string): Promise<void> {
  const current = await readSettings()
  current.anthropicApiKey = key.trim()
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
}

export async function hasStoredApiKey(): Promise<boolean> {
  const key = await getApiKey()
  return !!key
}

export const DEFAULT_AUTO_FETCH_MINUTES = 5

export async function getAutoFetchMinutes(): Promise<number> {
  const stored = await readSettings()
  const minutes = stored.autoFetchMinutes
  return typeof minutes === 'number' && minutes >= 0 ? minutes : DEFAULT_AUTO_FETCH_MINUTES
}

export async function setAutoFetchMinutes(minutes: number): Promise<void> {
  const current = await readSettings()
  current.autoFetchMinutes = Math.max(0, Math.round(minutes))
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
}

export async function getShowAvatars(): Promise<boolean> {
  const stored = await readSettings()
  return stored.showAvatars !== false
}

export async function setShowAvatars(show: boolean): Promise<void> {
  const current = await readSettings()
  current.showAvatars = show
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return normalizeNotificationSettings((await readSettings()).notifications)
}

export async function setNotificationSettings(next: NotificationSettings): Promise<NotificationSettings> {
  const current = await readSettings()
  const normalized = normalizeNotificationSettings(next)
  current.notifications = normalized
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
  return normalized
}

export async function getWorkspaceRepos(): Promise<string[]> {
  const stored = await readSettings()
  return stored.workspaceRepos ?? []
}

export async function addWorkspaceRepo(repoPath: string): Promise<string[]> {
  const current = await readSettings()
  const list = current.workspaceRepos ?? []
  if (!list.includes(repoPath)) list.push(repoPath)
  current.workspaceRepos = list
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
  return list
}

export async function removeWorkspaceRepo(repoPath: string): Promise<string[]> {
  const current = await readSettings()
  const list = (current.workspaceRepos ?? []).filter((p) => p !== repoPath)
  current.workspaceRepos = list
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
  return list
}

export async function getLastSession(): Promise<{
  lastRepo: string | null
  recentRepos: string[]
  layout: Partial<SavedLayout>
}> {
  const stored = await readSettings()
  return {
    lastRepo: stored.lastRepo ?? null,
    recentRepos: stored.recentRepos ?? [],
    layout: stored.layout ?? {}
  }
}

/** Remembers `repoPath` as the open repo and moves it to the top of the recent list. */
export async function recordOpenedRepo(repoPath: string): Promise<string[]> {
  const current = await readSettings()
  const recent = [repoPath, ...(current.recentRepos ?? []).filter((p) => p !== repoPath)]
  current.lastRepo = repoPath
  current.recentRepos = recent.slice(0, MAX_RECENT_REPOS)
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
  return current.recentRepos
}

export async function forgetRecentRepo(repoPath: string): Promise<string[]> {
  const current = await readSettings()
  current.recentRepos = (current.recentRepos ?? []).filter((p) => p !== repoPath)
  if (current.lastRepo === repoPath) current.lastRepo = null
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
  return current.recentRepos
}

export async function saveLayout(layout: Partial<SavedLayout>): Promise<void> {
  const current = await readSettings()
  current.layout = { ...current.layout, ...layout }
  await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
}
