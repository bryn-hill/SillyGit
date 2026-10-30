import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'getting-started/the-window',
  title: 'Find your way round the window',
  category: 'getting-started',
  summary: 'The tab bar, top bar, sidebar, commit graph, detail panel, terminal and Claude panel, and what each is for.',
  keywords: ['layout', 'window', 'sidebar', 'panel', 'toolbar', 'top bar', 'detail panel', 'resize', 'narrow'],
  related: [
    'getting-started/open-a-repository',
    'graph/commit-graph',
    'commits/stage-and-commit',
    'settings/appearance-and-layout'
  ],
  body: `SillyGit's window has the same parts in every repository:

- **Tab bar** (very top): one tab per repository, plus the Launchpad tab.
- **Top bar:** the repository and branch you're on, then the toolbar: **Undo**, **Redo**, **Pull**, **Push**, **Branch**, **Stash**, **Pop**, **Run**, **Terminal** and **Open in editor**. On the right are **Actions** (every command, searchable), the Claude button, **Help** and **Settings**.
- **Sidebar** (left): your branches grouped as Favourites, Local and Remote, then stashes, tags, worktrees, submodules and stacks.
- **Commit graph** (middle): your history. The top row, **Uncommitted changes**, is your working copy.
- **Detail panel** (right): whatever is selected. For the working copy that's the staged and unstaged files and the commit box; for a commit it's the message, author, files and diffs.
- **Terminal** (bottom, **Ctrl+\`**) and **Claude panel** (right edge, **Ctrl+Esc**), both hidden until you open them.

Drag the borders between the sidebar, graph and detail panel to resize them; SillyGit remembers the sizes. In a narrow window the toolbar drops its labels first, then moves Redo, Stash and Pop into a **More** menu, so everything still fits at half-screen width.

## Example

You click a commit in the graph. The detail panel switches to that commit and lists its files. Click a file and its diff fills the middle of the window, with the file list kept beside it so you can step through files with the arrow keys. Press **Esc** to go back to the graph.`
}

export default article
