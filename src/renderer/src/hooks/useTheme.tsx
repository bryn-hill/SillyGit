import { useEffect, useSyncExternalStore } from 'react'
import { resolveTheme, type Theme, type ThemePreference } from '../../../shared/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

/**
 * The theme to draw for `preference`, kept on <html data-theme> where the
 * colour tokens in styles/base.css pick it up. The main process points
 * prefers-color-scheme at the saved choice before the window opens, so
 * "system" is right even before the setting has loaded.
 */
export function useTheme(preference: ThemePreference): Theme {
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark)
  const theme = resolveTheme(preference, systemDark)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return theme
}
