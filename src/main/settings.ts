import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

interface StoredSettings {
  anthropicApiKey?: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'gitdesk-settings.json')
}

async function readSettings(): Promise<StoredSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
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
