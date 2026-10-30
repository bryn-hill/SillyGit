import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import type { SavedLayout, SavedTabs } from '../shared/types'
import { normalizeNotificationSettings, type NotificationSettings } from '../shared/notifications'
import { normalizeSprintSettings, type SprintSettings } from '../shared/sprints'
import { normalizeMergeToolSettings, type MergeToolSettings } from '../shared/mergeTools'
import { normalizeBranchListSettings, type BranchListSettings } from '../shared/branchStatus'
import { normalizeCustomCommands, type CustomCommand } from '../shared/customCommands'
import { normalizeThemePreference, type ThemePreference } from '../shared/theme'
import { normalizeEditorSettings, type EditorSettings } from '../shared/editors'
import { normalizeHelpSettings } from '../shared/help/tour'
import { isDefaultScope, normalizeGraphScope, type GraphScope } from '../shared/graphScope'
import type { HelpSettings } from '../shared/help/types'
import { normalizeRepoGroups, type RepoGroup } from '../shared/repoOverview'

interface StoredSettings {
  anthropicApiKey?: string
  workspaceRepos?: string[]
  /** The repository overview's groups, in the user's order. */
  repoGroups?: RepoGroup[]
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
  /** Light, dark, or follow the system. */
  theme?: ThemePreference
  /** Play the lanes-colliding animation on the graph when a merge lands. */
  mergeAnimation?: boolean
  /** Desktop notifications about pull requests. */
  notifications?: Partial<NotificationSettings>
  /** Sprint markers on the commit graph. */
  sprints?: Partial<SprintSettings>
  /** The external merge tool, if any. */
  mergeTool?: Partial<MergeToolSettings>
  /** The code editor or IDE that "Open in" uses. */
  editor?: Partial<EditorSettings>
  /** The user's own commands for the menus and command palette. */
  customCommands?: CustomCommand[]
  /** The Run button's command, per repo path. */
  runCommands?: Record<string, string>
  /** Extra untracked files to copy into an isolated run's checkout, per repo path. */
  runCopyFiles?: Record<string, string[]>
  /** Stale tags in the branch list. */
  branchList?: Partial<BranchListSettings>
  /** Starred branches, per repo path, in the order they were starred. */
  favouriteBranches?: Record<string, string[]>
  /** Branches hidden from or soloed in the commit graph, per repo path. */
  graphScopes?: Record<string, Partial<GraphScope>>
  /** Per repo: when the branch cleanup banner may show again, in ms. */
  cleanupSnoozedUntil?: Record<string, number>
  /** The first-use walkthrough: whether it was finished (or skipped) and which version. */
  help?: Partial<HelpSettings>
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

export async function getThemePreference(): Promise<ThemePreference> {
  return normalizeThemePreference((await readSettings()).theme)
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  await updateSettings((current) => {
    current.theme = normalizeThemePreference(preference)
  })
}

export async function getMergeAnimation(): Promise<boolean> {
  const stored = await readSettings()
  return stored.mergeAnimation !== false
}

export async function setMergeAnimation(on: boolean): Promise<void> {
  await updateSettings((current) => {
    current.mergeAnimation = on
  })
}

export async function getHelpSettings(): Promise<HelpSettings> {
  return normalizeHelpSettings((await readSettings()).help)
}

export async function setHelpSettings(next: HelpSettings): Promise<HelpSettings> {
  return updateSettings((current) => {
    const help = normalizeHelpSettings(next)
    current.help = help
    return help
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

export async function getEditorSettings(): Promise<EditorSettings> {
  return normalizeEditorSettings((await readSettings()).editor)
}

export async function setEditorSettings(next: EditorSettings): Promise<EditorSettings> {
  return updateSettings((current) => (current.editor = normalizeEditorSettings(next)))
}

export async function getCustomCommands(): Promise<CustomCommand[]> {
  return normalizeCustomCommands((await readSettings()).customCommands)
}

export async function setCustomCommands(next: CustomCommand[]): Promise<CustomCommand[]> {
  return updateSettings((current) => (current.customCommands = normalizeCustomCommands(next)))
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

export async function getRunCopyFiles(repoPath: string): Promise<string[]> {
  const files = (await readSettings()).runCopyFiles?.[repoPath]
  return Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : []
}

export async function setRunCopyFiles(repoPath: string, files: string[]): Promise<void> {
  await updateSettings((current) => {
    const all = { ...current.runCopyFiles }
    if (files.length) all[repoPath] = files
    else delete all[repoPath]
    current.runCopyFiles = all
  })
}

export async function getBranchListSettings(): Promise<BranchListSettings> {
  return normalizeBranchListSettings((await readSettings()).branchList)
}

export async function setBranchListSettings(next: BranchListSettings): Promise<BranchListSettings> {
  return updateSettings((current) => (current.branchList = normalizeBranchListSettings(next)))
}

export async function getFavouriteBranches(repoPath: string): Promise<string[]> {
  const list = (await readSettings()).favouriteBranches?.[repoPath]
  return Array.isArray(list) ? list.filter((n) => typeof n === 'string') : []
}

export async function setFavouriteBranches(repoPath: string, names: string[]): Promise<void> {
  await updateSettings((current) => {
    const all = { ...current.favouriteBranches }
    if (names.length > 0) all[repoPath] = [...new Set(names)]
    else delete all[repoPath]
    current.favouriteBranches = all
  })
}

export async function getGraphScope(repoPath: string): Promise<GraphScope> {
  return normalizeGraphScope((await readSettings()).graphScopes?.[repoPath])
}

export async function setGraphScope(repoPath: string, next: GraphScope): Promise<GraphScope> {
  const scope = normalizeGraphScope(next)
  return updateSettings((current) => {
    const all = { ...current.graphScopes }
    if (isDefaultScope(scope)) delete all[repoPath]
    else all[repoPath] = scope
    current.graphScopes = all
    return scope
  })
}

export async function getCleanupSnooze(repoPath: string): Promise<number | null> {
  const until = (await readSettings()).cleanupSnoozedUntil?.[repoPath]
  return typeof until === 'number' ? until : null
}

export async function setCleanupSnooze(repoPath: string, until: number | null): Promise<void> {
  await updateSettings((current) => {
    const all = { ...current.cleanupSnoozedUntil }
    if (until === null) delete all[repoPath]
    else all[repoPath] = until
    current.cleanupSnoozedUntil = all
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

export async function getRepoGroups(): Promise<RepoGroup[]> {
  return normalizeRepoGroups((await readSettings()).repoGroups)
}

export async function setRepoGroups(groups: RepoGroup[]): Promise<RepoGroup[]> {
  return updateSettings((current) => (current.repoGroups = normalizeRepoGroups(groups)))
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
