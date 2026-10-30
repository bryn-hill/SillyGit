import type { HelpSettings } from './types'

/**
 * Bump when the walkthrough gains steps worth seeing again: everyone who
 * finished an older version gets it once more on their next launch.
 */
export const TOUR_VERSION = 1

export const DEFAULT_HELP_SETTINGS: HelpSettings = {
  tourCompleted: false,
  tourVersion: 0
}

export function normalizeHelpSettings(stored: unknown): HelpSettings {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_HELP_SETTINGS }
  const s = stored as Partial<Record<keyof HelpSettings, unknown>>
  const version = typeof s.tourVersion === 'number' && Number.isFinite(s.tourVersion) ? Math.floor(s.tourVersion) : 0
  return {
    tourCompleted: s.tourCompleted === true,
    tourVersion: Math.max(0, version)
  }
}

/** Whether the walkthrough should start by itself: a repo is open and this version hasn't been finished or skipped. */
export function shouldAutoStartTour(settings: HelpSettings, repoOpen: boolean): boolean {
  return repoOpen && !(settings.tourCompleted && settings.tourVersion >= TOUR_VERSION)
}

/** What's saved once the walkthrough is finished or skipped. */
export function completedHelpSettings(): HelpSettings {
  return { tourCompleted: true, tourVersion: TOUR_VERSION }
}
