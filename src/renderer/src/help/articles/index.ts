import type { HelpArticle } from '../../../../shared/help/types'
import gettingStartedWelcome from './getting-started/welcome'
import gettingStartedOpenARepository from './getting-started/open-a-repository'
import gettingStartedCommandLine from './getting-started/command-line'
import gettingStartedTheWindow from './getting-started/the-window'
import gettingStartedCommandPalette from './getting-started/command-palette'
import gettingStartedKeyboardShortcuts from './getting-started/keyboard-shortcuts'
import graphCommitGraph from './graph/commit-graph'
import graphSearchAndFilter from './graph/search-and-filter'
import graphHideAndSoloBranches from './graph/hide-and-solo-branches'
import graphCommitDetails from './graph/commit-details'
import graphDiffs from './graph/diffs'
import graphCompare from './graph/compare'
import graphBlameAndFileHistory from './graph/blame-and-file-history'
import graphBrowseFilesAtCommit from './graph/browse-files-at-commit'
import graphDragAndDrop from './graph/drag-and-drop'
import graphSprintMarkers from './graph/sprint-markers'
import graphCiStatus from './graph/ci-status'
import commitsStageAndCommit from './commits/stage-and-commit'
import commitsLineStaging from './commits/line-staging'
import commitsAmendAndCoAuthors from './commits/amend-and-co-authors'
import commitsStash from './commits/stash'
import commitsFixupAndAbsorb from './commits/fixup-and-absorb'
import commitsCommitMessageHelp from './commits/commit-message-help'
import commitsEditFiles from './commits/edit-files'
import commitsGitLfs from './commits/git-lfs'
import commitsIgnoreFiles from './commits/ignore-files'
import branchesCreateAndSwitch from './branches/create-and-switch'
import branchesBranchMenu from './branches/branch-menu'
import branchesBranchStatusAndCleanup from './branches/branch-status-and-cleanup'
import branchesStackedBranches from './branches/stacked-branches'
import branchesGitFlow from './branches/git-flow'
import branchesTagsWorktreesSubmodules from './branches/tags-worktrees-submodules'
import branchesRemotes from './branches/remotes'
import remotesPrsPushPullFetch from './remotes-prs/push-pull-fetch'
import remotesPrsLaunchpad from './remotes-prs/launchpad'
import remotesPrsRepositoryOverview from './remotes-prs/repository-overview'
import remotesPrsCreatePullRequest from './remotes-prs/create-pull-request'
import remotesPrsReviewPullRequests from './remotes-prs/review-pull-requests'
import remotesPrsCheckOutPullRequest from './remotes-prs/check-out-pull-request'
import remotesPrsNotifications from './remotes-prs/notifications'
import remotesPrsPublishRepository from './remotes-prs/publish-repository'
import conflictsResolveConflicts from './conflicts/resolve-conflicts'
import conflictsMergeTool from './conflicts/merge-tool'
import conflictsResolveManyFiles from './conflicts/resolve-many-files'
import rebaseHistoryUndoAndRedo from './rebase-history/undo-and-redo'
import rebaseHistoryReflog from './rebase-history/reflog'
import rebaseHistoryInteractiveRebase from './rebase-history/interactive-rebase'
import rebaseHistoryEditOlderCommits from './rebase-history/edit-older-commits'
import rebaseHistoryBisect from './rebase-history/bisect'
import rebaseHistoryResetRevertCherryPick from './rebase-history/reset-revert-cherry-pick'
import lanesLanesOverview from './lanes/lanes-overview'
import lanesManageLanes from './lanes/manage-lanes'
import integrationsAccounts from './integrations/accounts'
import integrationsJira from './integrations/jira'
import integrationsAzureDevops from './integrations/azure-devops'
import integrationsStartWork from './integrations/start-work'
import aiClaudePanel from './ai/claude-panel'
import aiAiReview from './ai/ai-review'
import aiAiSetup from './ai/ai-setup'
import settingsSettingsOverview from './settings/settings-overview'
import settingsAppearanceAndLayout from './settings/appearance-and-layout'
import settingsRunButton from './settings/run-button'
import settingsCustomCommands from './settings/custom-commands'
import settingsSigningAndSshKeys from './settings/signing-and-ssh-keys'
import settingsUpdateSillygit from './settings/update-sillygit'

/** Every help article, in the order the help centre lists them within each category. */
export const HELP_ARTICLES: HelpArticle[] = [
  gettingStartedWelcome,
  gettingStartedOpenARepository,
  gettingStartedCommandLine,
  gettingStartedTheWindow,
  gettingStartedCommandPalette,
  gettingStartedKeyboardShortcuts,
  graphCommitGraph,
  graphSearchAndFilter,
  graphHideAndSoloBranches,
  graphCommitDetails,
  graphDiffs,
  graphCompare,
  graphBlameAndFileHistory,
  graphBrowseFilesAtCommit,
  graphDragAndDrop,
  graphSprintMarkers,
  graphCiStatus,
  commitsStageAndCommit,
  commitsLineStaging,
  commitsAmendAndCoAuthors,
  commitsStash,
  commitsFixupAndAbsorb,
  commitsCommitMessageHelp,
  commitsEditFiles,
  commitsGitLfs,
  commitsIgnoreFiles,
  branchesCreateAndSwitch,
  branchesBranchMenu,
  branchesBranchStatusAndCleanup,
  branchesStackedBranches,
  branchesGitFlow,
  branchesTagsWorktreesSubmodules,
  branchesRemotes,
  remotesPrsPushPullFetch,
  remotesPrsLaunchpad,
  remotesPrsRepositoryOverview,
  remotesPrsCreatePullRequest,
  remotesPrsReviewPullRequests,
  remotesPrsCheckOutPullRequest,
  remotesPrsNotifications,
  remotesPrsPublishRepository,
  conflictsResolveConflicts,
  conflictsMergeTool,
  conflictsResolveManyFiles,
  rebaseHistoryUndoAndRedo,
  rebaseHistoryReflog,
  rebaseHistoryInteractiveRebase,
  rebaseHistoryEditOlderCommits,
  rebaseHistoryBisect,
  rebaseHistoryResetRevertCherryPick,
  lanesLanesOverview,
  lanesManageLanes,
  integrationsAccounts,
  integrationsJira,
  integrationsAzureDevops,
  integrationsStartWork,
  aiClaudePanel,
  aiAiReview,
  aiAiSetup,
  settingsSettingsOverview,
  settingsAppearanceAndLayout,
  settingsRunButton,
  settingsCustomCommands,
  settingsSigningAndSshKeys,
  settingsUpdateSillygit
]

const BY_ID = new Map(HELP_ARTICLES.map((article) => [article.id, article]))

/** The article with this id (`<category>/<slug>`), if there is one. */
export function getArticle(id: string): HelpArticle | undefined {
  return BY_ID.get(id)
}

/** The Help menu's Keyboard shortcuts item opens this article. */
export const SHORTCUTS_ARTICLE = 'getting-started/keyboard-shortcuts'
