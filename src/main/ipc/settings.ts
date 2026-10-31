import { app, ipcMain } from 'electron'
import { join } from 'path'
import * as git from '../git'
import type { MergeToolSettings } from '../../shared/mergeTools'
import type { EditorSettings } from '../../shared/editors'
import type { CustomCommand } from '../../shared/customCommands'
import * as settings from '../settings'
import * as run from '../run'
import type { SprintSettings } from '../../shared/sprints'
import type { BranchListSettings } from '../../shared/branchStatus'
import type { GraphScope } from '../../shared/graphScope'
import type { SavedLayout, SavedSession, SavedTabs } from '../../shared/types'
import { wrap } from './wrap'
import { applyThemePreference } from '../theme'
import type { ThemePreference } from '../../shared/theme'
import type { DiffLayout } from '../../shared/diffLayout'
import type { HelpSettings } from '../../shared/help/types'
import type { RepoGroup } from '../../shared/repoOverview'

/** Settings, the saved session (tabs, recents, layout), per-repo Run commands and favourite branches. */
export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get-workspace-repos', () => settings.getWorkspaceRepos())

  ipcMain.handle('settings:add-workspace-repo', (_e, repoPath: string) =>
    wrap(async () => {
      if (!(await git.isGitRepo(repoPath))) {
        throw new Error(`"${repoPath}" is not a git repository.`)
      }
      return settings.addWorkspaceRepo(repoPath)
    })
  )

  ipcMain.handle('settings:remove-workspace-repo', (_e, repoPath: string) =>
    wrap(() => settings.removeWorkspaceRepo(repoPath))
  )

  ipcMain.handle('overview:get-groups', () => settings.getRepoGroups())
  ipcMain.handle('overview:set-groups', (_e, groups: RepoGroup[]) => wrap(() => settings.setRepoGroups(groups)))
  // Never throws: a repo that can't be read comes back as a row with its error.
  ipcMain.handle('overview:status', (_e, repoPaths: string[]) => git.repoOverview(repoPaths))

  ipcMain.handle('session:get', async (): Promise<SavedSession> => {
    const { lastRepo, recentRepos, openTabs, pinnedTabs, layout } = await settings.getLastSession()
    const exists = await Promise.all(recentRepos.map((p) => git.isGitRepo(p)))
    const tabExists = await Promise.all(openTabs.map((p) => git.isGitRepo(p)))
    const lastRepoExists = !!lastRepo && (await git.isGitRepo(lastRepo))
    const tabs = openTabs.filter((_, i) => tabExists[i])
    return {
      // When the active tab's repo is gone, show the first tab still open.
      repoPath: lastRepoExists ? lastRepo : (tabs[0] ?? null),
      missingRepo: lastRepo && !lastRepoExists ? lastRepo : null,
      recentRepos: recentRepos.filter((_, i) => exists[i]),
      openTabs: lastRepoExists && !tabs.includes(lastRepo) ? [...tabs, lastRepo] : tabs,
      pinnedTabs: pinnedTabs.filter((p) => tabs.includes(p)),
      layout
    }
  })

  ipcMain.handle('session:repo-opened', (_e, repoPath: string) =>
    wrap(() => settings.recordOpenedRepo(repoPath))
  )

  ipcMain.handle('session:forget-repo', (_e, repoPath: string) =>
    wrap(() => settings.forgetRecentRepo(repoPath))
  )

  ipcMain.handle('session:save-tabs', (_e, tabs: SavedTabs) => wrap(() => settings.saveTabs(tabs)))

  ipcMain.handle('session:save-layout', (_e, layout: Partial<SavedLayout>) =>
    wrap(() => settings.saveLayout(layout))
  )

  ipcMain.handle('settings:has-api-key', () => settings.hasStoredApiKey())

  ipcMain.handle('settings:get-auto-fetch', () => settings.getAutoFetchMinutes())

  ipcMain.handle('settings:set-auto-fetch', (_e, minutes: number) =>
    wrap(() => settings.setAutoFetchMinutes(minutes))
  )

  ipcMain.handle('settings:get-merge-tool', () => settings.getMergeToolSettings())

  ipcMain.handle('settings:set-merge-tool', (_e, next: MergeToolSettings) =>
    wrap(() => settings.setMergeToolSettings(next))
  )

  ipcMain.handle('settings:get-editor', () => settings.getEditorSettings())
  ipcMain.handle('settings:set-editor', (_e, next: EditorSettings) => wrap(() => settings.setEditorSettings(next)))

  ipcMain.handle('settings:get-custom-commands', () => settings.getCustomCommands())
  ipcMain.handle('settings:set-custom-commands', (_e, next: CustomCommand[]) =>
    wrap(() => settings.setCustomCommands(next))
  )

  ipcMain.handle('run:get-command', async (_e, repoPath: string) => {
    const suggestions = await run.suggestCommands(repoPath)
    return {
      command: await settings.getRunCommand(repoPath),
      suggestion: suggestions[0]?.command ?? '',
      suggestions
    }
  })
  ipcMain.handle('run:get-copy-files', (_e, repoPath: string) => settings.getRunCopyFiles(repoPath))
  ipcMain.handle('run:set-copy-files', (_e, repoPath: string, files: string[]) =>
    wrap(() => settings.setRunCopyFiles(repoPath, files))
  )
  ipcMain.handle('run:set-command', (_e, repoPath: string, command: string) =>
    wrap(() => settings.setRunCommand(repoPath, command))
  )
  ipcMain.handle('run:plan', (_e, repoPath: string, commit: string | null) =>
    wrap(() => run.planRun(repoPath, commit, join(app.getPath('userData'), 'run-checkouts')))
  )

  ipcMain.handle('settings:get-sprints', () => settings.getSprintSettings())

  ipcMain.handle('settings:set-sprints', (_e, next: SprintSettings) => wrap(() => settings.setSprintSettings(next)))

  ipcMain.handle('settings:get-branch-list', () => settings.getBranchListSettings())

  ipcMain.handle('settings:set-branch-list', (_e, next: BranchListSettings) =>
    wrap(() => settings.setBranchListSettings(next))
  )

  ipcMain.handle('branches:get-favourites', (_e, repoPath: string) => settings.getFavouriteBranches(repoPath))

  ipcMain.handle('branches:set-favourites', (_e, repoPath: string, names: string[]) =>
    wrap(() => settings.setFavouriteBranches(repoPath, names))
  )

  ipcMain.handle('graph:get-scope', (_e, repoPath: string) => settings.getGraphScope(repoPath))

  ipcMain.handle('graph:set-scope', (_e, repoPath: string, scope: GraphScope) =>
    wrap(() => settings.setGraphScope(repoPath, scope))
  )

  ipcMain.handle('branches:get-cleanup-snooze', (_e, repoPath: string) => settings.getCleanupSnooze(repoPath))

  ipcMain.handle('branches:set-cleanup-snooze', (_e, repoPath: string, until: number | null) =>
    wrap(() => settings.setCleanupSnooze(repoPath, until))
  )

  ipcMain.handle('settings:get-theme', () => settings.getThemePreference())

  ipcMain.handle('settings:set-theme', (_e, preference: ThemePreference) =>
    wrap(async () => {
      await settings.setThemePreference(preference)
      applyThemePreference(preference)
    })
  )

  ipcMain.handle('settings:get-help', () => settings.getHelpSettings())

  ipcMain.handle('settings:set-help', (_e, next: HelpSettings) => wrap(() => settings.setHelpSettings(next)))

  ipcMain.handle('settings:get-merge-animation', () => settings.getMergeAnimation())

  ipcMain.handle('settings:set-merge-animation', (_e, on: boolean) => wrap(() => settings.setMergeAnimation(on)))

  ipcMain.handle('settings:get-diff-layout', () => settings.getDiffLayout())

  ipcMain.handle('settings:set-diff-layout', (_e, layout: DiffLayout) => wrap(() => settings.setDiffLayout(layout)))

  ipcMain.handle('settings:set-api-key', (_e, key: string) => wrap(() => settings.setApiKey(key)))
}
