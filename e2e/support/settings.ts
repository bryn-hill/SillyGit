import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SavedLayout } from '../../src/shared/types'

/**
 * The panel layout saved in the app's settings file, if any. Layout saves are
 * debounced, so poll this before a relaunch rather than waiting a fixed time.
 */
export function savedLayout(userData: string): Partial<SavedLayout> | undefined {
  try {
    return JSON.parse(readFileSync(join(userData, 'sillygit-settings.json'), 'utf8')).layout
  } catch {
    return undefined
  }
}
