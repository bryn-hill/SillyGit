import { BrowserWindow, nativeTheme } from 'electron'
import { windowBackground, type ThemePreference } from '../shared/theme'

/**
 * Points Electron's native theme at the user's choice. Native bits (menus,
 * the macOS title bar, scrollbars) follow it, and so does the renderer's
 * prefers-color-scheme, which is how "System" is followed there.
 */
export function applyThemePreference(preference: ThemePreference): void {
  nativeTheme.themeSource = preference
  const background = windowBackground(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(background)
}
