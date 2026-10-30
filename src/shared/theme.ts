/** What the user picked in Settings: follow the OS, or always light or dark. */
export type ThemePreference = 'system' | 'light' | 'dark'

/** The theme actually drawn. */
export type Theme = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

// Dark until the user picks otherwise, so updating doesn't change the look.
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark'

export function normalizeThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : DEFAULT_THEME_PREFERENCE
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === 'system') return systemDark ? 'dark' : 'light'
  return preference
}

/** The window's background before the page paints, matching --bg in styles/base.css. */
export function windowBackground(theme: Theme): string {
  return theme === 'dark' ? '#282a36' : '#f7f7fa'
}
