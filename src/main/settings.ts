import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import type { SavedLayout, SavedTabs } from '../shared/types'
import { normalizeNotificationSettings, type NotificationSettings } from '../shared/notifications'
import { normalizeSprintSettings, type SprintSettings } from '../shared/sprints'
import { normalizeMergeToolSettings, type MergeToolSettings } from '../shared/mergeTools'

interface StoredSettings {
  anthropicApiKey?: string
  workspaceRepos?: string[]
  lastRepo?: string | null
  recentRepos?: string[]
  /** Repos open as tabs, in tab order; lastRepo is the active one. */
  openTabs?: string[]
  /** Tabs pinned to the left-hand group. */
  pinnedTabs?: string[]
  layout?: Partial<SavedLayout>
  /** Minutes between background fetches; 0 turns them off. */
  autoFetchMinutes?: number
  /** Look up author avatars online (GitHub, GitLab, Gravatar); off shows initials only. */
  showAvatars?: boolean
  /** Desktop notifications about pull requests. */
  notifications?: Partial<NotificationSettings>
  /** Sprint markers on the commit graph. */
  sprints?: Partial<SprintSettings>
  /** The external merge tool, if any. */
  mergeTool?: Partial<MergeToolSettings>
  /** The Run button's command, per repo path. */
  runCommands?: Record<string, string>
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

// Saves arrive in quick bursts (tabs, recent repos, layout, a Settings change
// at the same moment) and each rewrites the whole file, so they run one at a
// time or one would undo another.
let writes: Promise<unknown> = Promise.resolve()
function updateSettings<R>(change: (current: StoredSettings) => R): Promise<R> {
  const run = writes.then(async () => {
    const current = await readSettings()
    const result = change(current)
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(settingsPath(), JSON.stringify(current, null, 2), 'utf-8')
    return result
  })
  writes = run.catch(() => {})
  return run
}

export async function getApiKey(): Promise<string | null> {
  const stored = await readSettings()
  return stored.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null
}

export async function setApiKey(key: string): Promise<void> {
  await updateSettings((current) => {
    current.anthropicApiKey = key.trim()
  })
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
  await updateSettings((current) => {
    current.autoFetchMinutes = Math.max(0, Math.round(minutes))
  })
}

export async function getShowAvatars(): Promise<boolean> {
  const stored = await readSettings()
  return stored.showAvatars !== false
}

export async function setShowAvatars(show: boolean): Promise<void> {
  await updateSettings((current) => {
    current.showAvatars = show
  })
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return normalizeNotificationSettings((await readSettings()).notifications)
}

export async function setNotificationSettings(next: NotificationSettings): Promise<NotificationSettings> {
  return updateSettings((current) => (current.notifications = normalizeNotificationSettings(next)))
}

export async function getSprintSettings(): Promise<SprintSettings> {
  return normalizeSprintSettings((await readSettings()).sprints)
}

export async function setSprintSettings(next: SprintSettings): Promise<SprintSettings> {
  return updateSettings((current) => (current.sprints = normalizeSprintSettings(next)))
}

export async function getMergeToolSettings(): Promise<MergeToolSettings> {
  return normalizeMergeToolSettings((await readSettings()).mergeTool)
}

export async function setMergeToolSettings(next: MergeToolSettings): Promise<MergeToolSettings> {
  return updateSettings((current) => (current.mergeTool = normalizeMergeToolSettings(next)))
}

export async function getRunCommand(repoPath: string): Promise<string | null> {
  return (await readSettings()).runCommands?.[repoPath]?.trim() || null
}

export async function setRunCommand(repoPath: string, command: string): Promise<void> {
  await updateSettings((current) => {
    const commands = { ...current.runCommands }
    if (command.trim()) commands[repoPath] = command.trim()
    else delete commands[repoPath]
    current.runCommands = commands
  })
}

export async function getWorkspaceRepos(): Promise<string[]> {
  const stored = await readSettings()
  return stored.workspaceRepos ?? []
}

export async function addWorkspaceRepo(repoPath: string): Promise<string[]> {
  return updateSettings((current) => {
    const list = current.workspaceRepos ?? []
    if (!list.includes(repoPath)) list.push(repoPath)
    return (current.workspaceRepos = list)
  })
}

export async function removeWorkspaceRepo(repoPath: string): Promise<string[]> {
  return updateSettings((current) => (current.workspaceRepos = (current.workspaceRepos ?? []).filter((p) => p !== repoPath)))
}

export async function getLastSession(): Promise<{
  lastRepo: string | null
  recentRepos: string[]
  openTabs: string[]
  pinnedTabs: string[]
  layout: Partial<SavedLayout>
}> {
  const stored = await readSettings()
  const lastRepo = stored.lastRepo ?? null
  return {
    lastRepo,
    recentRepos: stored.recentRepos ?? [],
    // Settings from before tabs only know the one open repo.
    openTabs: stored.openTabs ?? (lastRepo ? [lastRepo] : []),
    pinnedTabs: stored.pinnedTabs ?? [],
    layout: stored.layout ?? {}
  }
}

/** Remembers `repoPath` as the open repo and moves it to the top of the recent list. */
export async function recordOpenedRepo(repoPath: string): Promise<string[]> {
  return updateSettings((current) => {
    const recent = [repoPath, ...(current.recentRepos ?? []).filter((p) => p !== repoPath)]
    current.lastRepo = repoPath
    return (current.recentRepos = recent.slice(0, MAX_RECENT_REPOS))
  })
}

export async function forgetRecentRepo(repoPath: string): Promise<string[]> {
  return updateSettings((current) => {
    if (current.lastRepo === repoPath) current.lastRepo = null
    return (current.recentRepos = (current.recentRepos ?? []).filter((p) => p !== repoPath))
  })
}

/** Remembers the open tabs, which are pinned, and which one is active. */
export async function saveTabs(tabs: SavedTabs): Promise<void> {
  await updateSettings((current) => {
    current.openTabs = tabs.openTabs
    current.pinnedTabs = tabs.pinnedTabs.filter((p) => tabs.openTabs.includes(p))
    current.lastRepo = tabs.activeTab
  })
}

export async function saveLayout(layout: Partial<SavedLayout>): Promise<void> {
  await updateSettings((current) => {
    current.layout = { ...current.layout, ...layout }
  })
}
