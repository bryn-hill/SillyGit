import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/commit-graph',
  title: 'Read the commit graph',
  category: 'graph',
  summary: 'What the graph shows: lanes, branch and tag pills, avatars, the working copy row and how to select commits.',
  keywords: ['graph', 'ci', 'history', 'log', 'lanes', 'commits', 'branch tag column', 'avatars', 'wip', 'select'],
  related: ['graph/search-and-filter', 'graph/commit-details', 'graph/drag-and-drop', 'getting-started/the-window'],
  body: `The commit graph is SillyGit's history view. Each row is a commit, newest at the top; coloured lines show how branches fork and merge.

- **Branch / Tag column:** pills for the branches and tags pointing at each commit. Your checked-out branch is highlighted, and a cloud icon shows where the remote branch is. Drag the column's edge to widen it.
- **CI results:** a green, red or yellow line before the branch names (or ✓ ✕ ● symbols, in Settings) show whether a pushed commit's checks passed, failed or are running. See [See CI results on the graph](help:graph/ci-status).
- **Avatars:** each commit shows its author's picture, looked up by email (turn them off in Settings). Claude and Renovate commits get their own logos.
- **Uncommitted changes:** the top row is your working copy. Select it to stage and commit.
- **Animations:** new commits, merges and commits arriving from a pull grow into the graph. Turn this off in Settings.
- Long histories load in pages as you scroll.

## Selecting

- **Click** a commit to see its details on the right. **Cmd+click** adds commits to the selection and **Shift+click** selects a range, for cherry-picking several at once.
- **Double-click** a branch pill, or a branch in the sidebar, to check it out.
- **Right-click** a commit or pill for its menu: checkout, create a branch or tag, cherry-pick, revert, reset, interactive rebase, bisect, copy the SHA and more.
- Use **Up** and **Down** to move through commits.

## Example

You want to see what a teammate merged yesterday. Find the merge commit (two lines join at its dot), click it, and the detail panel lists every file the merge brought in. Click a file to read its diff full-window; the arrow keys step through the rest.`
}

export default article
