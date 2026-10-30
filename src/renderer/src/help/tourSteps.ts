import type { TourStep } from '../../../shared/help/types'
import { MOD } from '../lib/shortcuts'

/**
 * The first-use walkthrough. Each step spotlights the element carrying its
 * `data-tour` target; a step whose target isn't on screen is shown in the
 * middle of the window instead. Bump TOUR_VERSION in shared/help/tour.ts when
 * a change here is worth showing people who already finished the tour.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to SillyGit',
    body: 'A quick look around: about a minute, and you can skip it any time. You can start it again later from **Help → Start walkthrough** or the command palette.',
    articleId: 'getting-started/welcome'
  },
  {
    id: 'tabs',
    title: 'Repositories open as tabs',
    body: 'Each repository gets its own tab. Use **+** to open or clone another one, and right-click a tab to pin it.',
    target: 'repo-tabs',
    placement: 'bottom',
    articleId: 'getting-started/open-a-repository'
  },
  {
    id: 'graph',
    title: 'The commit graph',
    body: 'Every commit, branch and tag, newest at the top. Click a commit to see its changes; right-click it for actions like cherry-pick, revert or reset.',
    target: 'graph',
    placement: 'left',
    articleId: 'graph/commit-graph'
  },
  {
    id: 'branches',
    title: 'Branches, remotes and more',
    body: 'Your local and remote branches, tags, stashes and submodules. Double-click a branch to check it out, or drag it onto another to merge or rebase.',
    target: 'branch-sidebar',
    placement: 'right',
    articleId: 'branches/create-and-switch'
  },
  {
    id: 'commit',
    title: 'Stage and commit',
    body: 'When you have changes, a **WIP** row sits at the top of the graph. Select it to stage files (or single lines), write a message and commit.',
    target: 'commit-box',
    placement: 'left',
    articleId: 'commits/stage-and-commit'
  },
  {
    id: 'sync',
    title: 'Pull, push and fetch',
    body: 'Keep in step with your remote. The arrow next to **Pull** lets you fetch only, or choose whether pulling merges or rebases.',
    target: 'toolbar-pull',
    placement: 'bottom',
    articleId: 'remotes-prs/push-pull-fetch'
  },
  {
    id: 'undo',
    title: 'Undo almost anything',
    body: `Committed, checked out or reset by mistake? **Undo** (${MOD}Z) takes it back, and **Redo** puts it back again.`,
    target: 'toolbar-undo',
    placement: 'bottom',
    articleId: 'rebase-history/undo-and-redo'
  },
  {
    id: 'conflicts',
    title: 'Conflicts, handled',
    body: 'If a merge, rebase or cherry-pick stops on a conflict, SillyGit lists the files and opens a side-by-side resolver where you pick ours, theirs or both, line by line.',
    articleId: 'conflicts/resolve-conflicts'
  },
  {
    id: 'launchpad',
    title: 'Launchpad',
    body: 'Pull requests and issues from your connected accounts, across every repository. Check out a pull request or review it without leaving the app.',
    target: 'launchpad',
    placement: 'bottom',
    articleId: 'remotes-prs/launchpad'
  },
  {
    id: 'repo-overview',
    title: 'All your repositories',
    body: 'Every repository you work on, in your own groups, with its branch, commits to push or pull and uncommitted changes. **Fetch all** updates them in one go.',
    target: 'repo-overview',
    placement: 'bottom',
    articleId: 'remotes-prs/repository-overview'
  },
  {
    id: 'palette',
    title: 'Every action, one search away',
    body: `**Actions** (or ${MOD}K) opens the command palette: type a few letters of anything SillyGit can do.`,
    target: 'command-palette',
    placement: 'bottom',
    articleId: 'getting-started/command-palette'
  },
  {
    id: 'claude',
    title: 'Claude, built in',
    body: 'Open the Claude panel to ask about your code, have changes made, or get help writing commit messages and resolving conflicts.',
    target: 'ai-panel',
    placement: 'bottom',
    articleId: 'ai/claude-panel'
  },
  {
    id: 'lanes',
    title: 'Lanes',
    body: 'Working on several things at once? Lanes keep separate sets of changes apart in one working copy, so each can be committed on its own branch. Start them from the command palette.',
    articleId: 'lanes/lanes-overview'
  },
  {
    id: 'settings',
    title: 'Make it yours',
    body: 'Settings has accounts for GitHub, GitLab, Bitbucket and Azure DevOps, the theme, your editor, merge tool and more.',
    target: 'settings',
    placement: 'bottom',
    articleId: 'settings/settings-overview'
  },
  {
    id: 'finish',
    title: "You're all set",
    body: 'Help is always here: articles on every feature, keyboard shortcuts, and this walkthrough again.',
    target: 'help-button',
    placement: 'bottom',
    articleId: 'getting-started/keyboard-shortcuts'
  }
]
