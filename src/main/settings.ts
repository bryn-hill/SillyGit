import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

interface StoredSettings {
  anthropicApiKey?: string
  workspaceRepos?: string[]
}

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
