import { DEFAULT_SPRINT_SETTINGS } from '../../../shared/sprints'
import { DEFAULT_BRANCH_LIST_SETTINGS } from '../../../shared/branchStatus'
import { DEFAULT_MERGE_TOOL_SETTINGS, mergeToolName } from '../../../shared/mergeTools'
import type { CustomCommand } from '../../../shared/customCommands'
import { useSavedSetting } from './useSavedSetting'

const NO_COMMANDS: CustomCommand[] = []

/** The app-wide settings kept by the main process, as the Settings dialog edits them. */
export function useAppSettings(onError: (message: string) => void) {
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
  // The user's own commands for the menus and palette.
  const [customCommands, setCustomCommands] = useSavedSetting(
    window.api.getCustomCommands,
    window.api.setCustomCommands,
    NO_COMMANDS,
    onError
  )
  return {
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
    branchList,
    setBranchList,
    mergeAnimation,
    setMergeAnimation
  }
}

export type AppSettings = ReturnType<typeof useAppSettings>
