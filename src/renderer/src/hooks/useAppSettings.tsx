import { DEFAULT_SPRINT_SETTINGS } from '../../../shared/sprints'
import { DEFAULT_BRANCH_LIST_SETTINGS } from '../../../shared/branchStatus'
import { DEFAULT_MERGE_TOOL_SETTINGS, mergeToolName } from '../../../shared/mergeTools'
import type { CustomCommand } from '../../../shared/customCommands'
import type { ThemePreference } from '../../../shared/theme'
import { DEFAULT_EDITOR_SETTINGS } from '../../../shared/editors'
import { DEFAULT_DIFF_LAYOUT } from '../../../shared/diffLayout'
import { useSavedSetting } from './useSavedSetting'
import { useTheme } from './useTheme'

const NO_COMMANDS: CustomCommand[] = []

/** The app-wide settings kept by the main process, as the Settings dialog edits them. */
export function useAppSettings(onError: (message: string) => void) {
  // Light, dark or follow the system. Until it loads, "system" shows what the
  // main process already applied from the saved choice.
  const [themePreference, setThemePreference] = useSavedSetting<ThemePreference>(
    window.api.getThemePreference,
    window.api.setThemePreference,
    'system',
    onError
  )
  const theme = useTheme(themePreference)
  // Minutes between background fetches (0 = off).
  const [autoFetchMinutes, setAutoFetchMinutes] = useSavedSetting(
    window.api.getAutoFetchMinutes,
    window.api.setAutoFetchMinutes,
    null,
    onError
  )
  // Sprint markers on the graph (off by default).
  const [sprints, setSprints] = useSavedSetting(
    window.api.getSprintSettings,
    window.api.setSprintSettings,
    DEFAULT_SPRINT_SETTINGS,
    onError
  )
  const [mergeTool, setMergeTool] = useSavedSetting(
    window.api.getMergeToolSettings,
    window.api.setMergeToolSettings,
    DEFAULT_MERGE_TOOL_SETTINGS,
    onError
  )
  // The editor "Open in" uses; null picks the first one installed.
  const [editor, setEditor] = useSavedSetting(
    window.api.getEditorSettings,
    window.api.setEditorSettings,
    DEFAULT_EDITOR_SETTINGS,
    onError
  )
  // Stale tags in the branch list.
  const [branchList, setBranchList] = useSavedSetting(
    window.api.getBranchListSettings,
    window.api.setBranchListSettings,
    DEFAULT_BRANCH_LIST_SETTINGS,
    onError
  )
  // Lanes colliding into a new merge on the graph (on by default).
  const [mergeAnimation, setMergeAnimation] = useSavedSetting(
    window.api.getMergeAnimation,
    window.api.setMergeAnimation,
    true,
    onError
  )
  // CI results as symbols instead of a coloured line (off by default).
  const [ciSymbols, setCiSymbols] = useSavedSetting(window.api.getCiSymbols, window.api.setCiSymbols, false, onError)
  // Unified or side-by-side text diffs, everywhere a file's diff is shown.
  const [diffLayout, setDiffLayout] = useSavedSetting(
    window.api.getDiffLayout,
    window.api.setDiffLayout,
    DEFAULT_DIFF_LAYOUT,
    onError
  )
  // The user's own commands for the menus and palette.
  const [customCommands, setCustomCommands] = useSavedSetting(
    window.api.getCustomCommands,
    window.api.setCustomCommands,
    NO_COMMANDS,
    onError
  )
  return {
    themePreference,
    setThemePreference,
    /** The theme being drawn. */
    theme,
    customCommands,
    setCustomCommands,
    autoFetchMinutes,
    setAutoFetchMinutes,
    sprints,
    setSprints,
    mergeTool,
    setMergeTool,
    /** The external merge tool's name, or null when none is set up. */
    externalToolName: mergeToolName(mergeTool),
    editor,
    setEditor,
    branchList,
    setBranchList,
    mergeAnimation,
    setMergeAnimation,
    ciSymbols,
    setCiSymbols,
    diffLayout,
    setDiffLayout
  }
}

export type AppSettings = ReturnType<typeof useAppSettings>
